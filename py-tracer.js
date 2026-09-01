// py-tracer.js
// Deterministic Python execution engine using Pyodide and sys.settrace

let pyodideReadyPromise = null;

async function initPyodideEngine() {
    if (!pyodideReadyPromise) {
        pyodideReadyPromise = (async () => {
            const pyodide = await loadPyodide();
            return pyodide;
        })();
    }
    return pyodideReadyPromise;
}

const TRACER_PYTHON_CODE = `
import sys
import json
import inspect
import ast

class Tracer:
    def __init__(self):
        self.trace_steps = []
        
    def serialize_value(self, val, visited=None):
        if visited is None:
            visited = set()
            
        if val is None:
            return None
        if isinstance(val, (int, float, str, bool)):
            return val
        if isinstance(val, list):
            if id(val) in visited: return "[Circular]"
            visited.add(id(val))
            return [self.serialize_value(x, visited) for x in val]
            
        # Detect Linked List Nodes
        if hasattr(val, 'val') and hasattr(val, 'next'):
            return f"node(id={id(val)}, val={val.val})"
            
        return str(val)

    def extract_linked_list_graph(self, locals_dict):
        nodes = []
        connections = []
        pointers = {}
        visited_nodes = set()
        
        # 1. Find all node objects in locals
        for var_name, var_val in locals_dict.items():
            if hasattr(var_val, 'val') and hasattr(var_val, 'next'):
                pointers[var_name] = id(var_val)
                self._traverse_list(var_val, nodes, connections, visited_nodes)
                
        return nodes, connections, pointers
        
    def _traverse_list(self, node, nodes, connections, visited):
        if node is None or id(node) in visited:
            return
        visited.add(id(node))
        
        nodes.append({"id": id(node), "val": str(node.val)})
        
        if node.next is not None:
            connections.append([id(node), id(node.next)])
            self._traverse_list(node.next, nodes, connections, visited)

    def trace_calls(self, frame, event, arg):
        if event != 'line':
            return self.trace_calls
            
        # Filter out internal/stdlib frames
        if "solution_code.py" not in frame.f_code.co_filename:
            return self.trace_calls

        # Adjust for the 19 lines of prepended imports and classes
        line_no = frame.f_lineno - 19
        if line_no < 1: return self.trace_calls

        locals_dict = {k: v for k, v in frame.f_locals.items() if not k.startswith('__') and k != 'self'}
        
        # Serialize variables
        vars_serialized = {k: self.serialize_value(v) for k, v in locals_dict.items()}
        
        # Extract visual graph for Linked Lists
        nodes, connections, pointers = self.extract_linked_list_graph(locals_dict)
        
        step_data = {
            "line": line_no,
            "variables": vars_serialized,
            "visualization": {
                "type": "linked_list",
                "nodes": nodes,
                "connections": connections,
                "pointers": pointers
            }
        }
        
        self.trace_steps.append(step_data)
        return self.trace_calls

def build_list_from_array(arr, ListNodeClass):
    if not arr:
        return None
    head = ListNodeClass(arr[0])
    curr = head
    for val in arr[1:]:
        curr.next = ListNodeClass(val)
        curr = curr.next
    return head

def run_user_code(code, example_input):
    tracer = Tracer()
    namespace = {}
    
    # Prepend common LeetCode imports to prevent NameErrors on type hints
    common_imports = \"\"\"
from typing import *
import collections
import math
import itertools
import functools
import heapq
import bisect

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
\"\"\"
    
    full_code = common_imports + code
    
    # Save the code to a virtual file so the tracer can filter it
    with open("solution_code.py", "w") as f:
        f.write(full_code)
        
    compiled = compile(full_code, "solution_code.py", "exec")
    exec(compiled, namespace)
    
    # Try to find Solution class
    SolutionClass = namespace.get('Solution')
    ListNodeClass = namespace.get('ListNode')
    
    if not SolutionClass:
        raise Exception("Could not find 'class Solution:' in your code.")
        
    solution_inst = SolutionClass()
    
    # Find the target method (first method that doesn't start with __)
    methods = [m for m in dir(solution_inst) if not m.startswith('__') and callable(getattr(solution_inst, m))]
    if not methods:
        raise Exception("Could not find a valid method in Solution class.")
    
    target_method_name = methods[0]
    target_method = getattr(solution_inst, target_method_name)
    
    # Parse example input (Assuming format like \`head = [4,2,1,3]\`)
    # Very basic parsing for arrays -> Linked Lists
    try:
        val_str = example_input.split("=")[1].strip()
        arr = ast.literal_eval(val_str)
        
        if ListNodeClass and isinstance(arr, list):
            target_arg = build_list_from_array(arr, ListNodeClass)
        else:
            target_arg = arr
    except Exception as e:
        raise Exception("Failed to parse example input. Ensure format like 'head = [1, 2, 3]'")
    
    # Run tracing
    sys.settrace(tracer.trace_calls)
    try:
        target_method(target_arg)
    except Exception as e:
        sys.settrace(None)
        # We might want to trace exceptions too, but let's just raise for now
        pass 
    sys.settrace(None)
    
    return json.dumps(tracer.trace_steps)
`;

async function executeDeterministicTrace(code, exampleInput) {
    const pyodide = await initPyodideEngine();
    
    // Ensure tracer logic is loaded
    await pyodide.runPythonAsync(TRACER_PYTHON_CODE);
    
    // Call the python runner
    // We pass variables safely using Pyodide globals
    pyodide.globals.set("user_code", code);
    pyodide.globals.set("example_input", exampleInput);
    
    const jsonTraceStr = await pyodide.runPythonAsync(`run_user_code(user_code, example_input)`);
    
    const steps = JSON.parse(jsonTraceStr);
    
    // We still need to call Groq for the explanations!
    // We can do this in app.js or here.
    return {
        visualization_type: "linked_list",
        steps: steps
    };
}
