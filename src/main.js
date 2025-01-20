const ui = { header: null }

const logFile = {
  name: "lab0-test1.txt", content:
    `[FINEST ] [2025-01-20 15:01:01.173989014] [dslabs.framework.Node] MessageSend(client1 -> pingserver, PingRequest(ping=PingApplication.Ping(value=Hello, World!)))
[FINEST ] [2025-01-20 15:01:01.182533829] [dslabs.framework.Node] TimerSet(-> client1, PingTimer(ping=PingApplication.Ping(value=Hello, World!)))
[FINER  ] [2025-01-20 15:01:01.188420714] [dslabs.framework.Node] MessageReceive(client1 -> pingserver, PingRequest(ping=PingApplication.Ping(value=Hello, World!)))
[FINEST ] [2025-01-20 15:01:01.191562866] [dslabs.framework.Node] MessageSend(pingserver -> client1, PongReply(pong=PingApplication.Pong(value=Hello, World!)))
[FINER  ] [2025-01-20 15:01:01.192877030] [dslabs.framework.Node] MessageReceive(pingserver -> client1, PongReply(pong=PingApplication.Pong(value=Hello, World!)))
[FINER  ] [2025-01-20 15:01:01.195212143] [dslabs.framework.Node] TimerReceive(-> client1, PingTimer(ping=PingApplication.Ping(value=Hello, World!)))
`}

function createUI() {
  const app = document.querySelector("#app");
  if (app === null) {
    return;
  }

  const header = document.createElement("div");
  app.appendChild(header);
  ui.header = header;

  const uploadButton = document.createElement("input");
  uploadButton.type = "file";
  uploadButton.addEventListener('change', () => {
    if (uploadButton.files === null) {
      return;
    }
    console.assert(uploadButton.files.length == 1);
    const file = uploadButton.files[0];

    const fileReader = new FileReader();
    fileReader.onload = () => {
      logFile.name = file.name;
      logFile.content = fileReader.result;
      renderUI();
    };
    fileReader.readAsText(file);
  });
  app.appendChild(uploadButton);

  renderUI();
}

function renderUI() {
  ui.header.innerHTML = `<strong>DSLabs Log Visualizer:</strong> ${logFile.name}`;
}

document.addEventListener('DOMContentLoaded', createUI);