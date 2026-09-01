# DSA Code Visualizer

![Live Demo](https://img.shields.io/badge/Live_Demo-View_App-blue?style=for-the-badge)
**[Click here to view the live app!](https://leetcode-solution-visualizer-1wmj9f1v3.vercel.app/)**

A step-by-step code visualization tool designed to help you dry-run LeetCode and DSA problems. Instead of just seeing the final output, this app breaks down the logic line-by-line, combining visual tracing with AI-generated explanations.

## ✨ Features
* **Step-by-step Execution:** Play, pause, or step through your code manually.
* **AI Narration:** Get instant, AI-powered explanations for every line using the **Groq API**.
* **Variable Tracking:** Watch variables and memory update in real-time as your code runs.
* **In-Browser Execution:** Securely runs your Python algorithms right in the browser using Pyodide.

## 🚀 How to Use
1. Open the [live app](https://leetcode-solution-visualizer-1wmj9f1v3.vercel.app/).
2. Click **Settings** and add your free [Groq API key](https://console.groq.com/keys) (it is stored locally and never sent to our servers).
3. Paste your code and provide an example input.
4. Click **Build & Analyze** to generate your visualization!

## 🛠️ Tech Stack
* HTML, CSS, Vanilla JavaScript
* [Pyodide](https://pyodide.org/) (for in-browser Python execution)
* [Groq API](https://groq.com/) (for high-speed AI code explanation)

## 💻 Local Development
If you want to run this project locally on your machine:
1. Clone this repository:
   ```bash
   git clone https://github.com/SaniyaNirmale/Leetcode_solution_visualizer.git
   ```
2. Open the `index.html` file in any modern web browser, or use a local server like Live Server in VS Code.
3. Enter your Groq API key in the UI settings when prompted.
