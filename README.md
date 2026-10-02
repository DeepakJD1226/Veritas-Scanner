# Veritas - automatic document review

1. Install Node.js 22.13 or newer. Node.js 24 is recommended.
2. Extract this ZIP.
3. On Windows, double-click `start-windows.bat`.
4. Open http://localhost:8787 in Chrome or Edge.

No npm install is required. The backend is already compiled to JavaScript and the interface is prebuilt.

The app supports PDF, DOCX, TXT and MD uploads up to 10 MB, plus pasted text up to 50,000 words. Internet access improves public-source discovery. If website access is unavailable, Veritas still gives a labelled local plagiarism-risk estimate. A local multilingual semantic model can compare translated or deeply rewritten passages after readable sources are found; first use downloads the model into the browser cache. AI writing signal is an estimate, not proof of authorship.

If the browser or firewall asks for permission, allow the local app on private networks. If `node` is not recognized, reinstall Node.js and restart the terminal or system.
