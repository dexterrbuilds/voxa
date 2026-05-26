const http = require("http");
const fs = require("fs");
const path = require("path");

const hostname = "127.0.0.1";
const port = 3000;

// Create a simple server to serve static files for demonstration
const server = http.createServer((req, res) => {
  // Simple static file server for demonstration purposes
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html");
  res.end(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Voxa Beta</title>
        <style>
          body {
            background: black;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .container {
            text-align: center;
            max-width: 600px;
            padding: 2rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Voxa Beta</h1>
          <p>A private cinematic voice platform where humans and AI personalities exist together inside immersive real-time conversational spaces.</p>
          <button style="background: #3b82f6; color: white; padding: 0.75rem 1.5rem; border-radius: 0.375rem; border: none; cursor: pointer; margin-top: 1rem;">
            Enter Room
          </button>
        </div>
      </body>
    </html>
  `);
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
