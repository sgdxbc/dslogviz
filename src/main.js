const ui = { header: null, stats: null }

const logName = "lab0-test1.txt";
const logContent =
  processLog(`[FINEST ] [2025-01-20 15:01:01.173989014] [dslabs.framework.Node] MessageSend(client1 -> pingserver, PingRequest(ping=PingApplication.Ping(value=Hello, World!)))
[FINEST ] [2025-01-20 15:01:01.182533829] [dslabs.framework.Node] TimerSet(-> client1, PingTimer(ping=PingApplication.Ping(value=Hello, World!)))
[FINER  ] [2025-01-20 15:01:01.188420714] [dslabs.framework.Node] MessageReceive(client1 -> pingserver, PingRequest(ping=PingApplication.Ping(value=Hello, World!)))
[FINEST ] [2025-01-20 15:01:01.191562866] [dslabs.framework.Node] MessageSend(pingserver -> client1, PongReply(pong=PingApplication.Pong(value=Hello, World!)))
[FINER  ] [2025-01-20 15:01:01.192877030] [dslabs.framework.Node] MessageReceive(pingserver -> client1, PongReply(pong=PingApplication.Pong(value=Hello, World!)))
[FINER  ] [2025-01-20 15:01:01.195212143] [dslabs.framework.Node] TimerReceive(-> client1, PingTimer(ping=PingApplication.Ping(value=Hello, World!)))
`);

function createUI() {
  const app = document.querySelector("#app");
  if (app === null) {
    return;
  }

  ui.header = document.createElement("div");
  app.appendChild(ui.header);

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
      ui.header.innerHTML = "Processing";
      requestAnimationFrame(() => {
        logFile.content = processLog(fileReader.result);
        renderUI();
      });
    };
    ui.header.innerHTML = "Loading";
    fileReader.readAsText(file);
  });
  app.appendChild(uploadButton);

  ui.stats = document.createElement('div');
  app.appendChild(ui.stats);

  renderUI();
}

function processLog(text) {
  const spans = [];
  const events = [];
  let logOffset = 0;
  const nodes = new Set();
  const inflightMessageSend = [];
  const inflightTimerSet = [];
  for (let line of text.split('\n')) {
    if (line === "") {
      continue;
    }
    const reLevel = /\[(FINEST|FINER) *\]/.source;
    const reTime = /\[(\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3})(\d{6})\]/.source;
    const reSource = /\[([\w\.]*)\]/.source;
    const reMessage = /(MessageSend|MessageReceive)\((\w+) -> (\w+), (\w+)\((.*)\)\)/.source;
    const reTimer = /(TimerSet|TimerReceive)\(-> (\w+), (\w+)\((.*)\)\)/.source;
    const reOther = /(.*)/.source;
    const re = new RegExp(`^${reLevel} ${reTime} ${reSource} (${reMessage}|${reTimer}|${reOther})`);
    const m = line.match(re);
    if (m === null) {
      // TODO warn unrecognized line
      continue;
    }

    const level = m[1], dateString = m[2], subMillisecond = m[3], source = m[4], messageType = m[6], timerType = m[11];
    const logTime = Date.parse(dateString) + Number.parseInt(subMillisecond) / 1_000_000;
    if (logOffset === 0) {
      logOffset = logTime;
    }
    const time = logTime - logOffset;
    let event;
    if (source === "dslabs.framework.Node") {
      if (messageType !== undefined) {
        const sendNode = m[7], receiveNode = m[8], name = m[9], data = m[10];
        event = { time, type: messageType, sendNode, receiveNode, name, data };
        nodes.add(sendNode);
        nodes.add(receiveNode);
      } else if (timerType !== undefined) {
        const node = m[12], name = m[13], data = m[14];
        event = { time, type: timerType, node, name, data };
        nodes.add(node);
      } else {
        // TODO warn invalid log
        continue;
      }
    } else {
      const content = m[15];
      event = { time, type: "*", level, content };
    }
    console.log(event);

    if (event.type === "MessageReceive" || event.type === "TimerReceive") {
      spans.push(event);
    } else {
      events.push(event);
    }

    // if there are multiple identical inflight events, assuming they are arriving in order
    if (event.type === "MessageSend") {
      inflightMessageSend.push(event);
    }
    if (event.type === "TimerSet") {
      inflightTimerSet.push(event);
    }
    if (event.type === "MessageReceive") {
      for (const [index, inflightEvent] of inflightMessageSend.entries()) {
        if (
          inflightEvent.sendNode === event.sendNode
          && inflightEvent.receiveNode == event.receiveNode
          && inflightEvent.name == event.name
          && inflightEvent.data == inflightEvent.data
        ) {
          event.causedBy = inflightEvent;
          inflightEvent.become = event;
          inflightMessageSend.splice(index, 1);
          break;
        }
      }
    }
    if (event.type === "TimerReceive") {
      for (const [index, inflightEvent] of inflightTimerSet.entries()) {
        if (
          inflightEvent.node === event.node
          && inflightEvent.name == event.name
          && inflightEvent.data == inflightEvent.data
        ) {
          event.causedBy = inflightEvent;
          inflightEvent.become = event;
          inflightTimerSet.splice(index, 1);
          break;
        }
      }
    }
  }
  return { spans, events, logOffset, nodes: new Array(...nodes) };
}

function renderUI() {
  ui.header.innerHTML = `<strong>DSLabs Log Visualizer:</strong> ${logName}`;
  const duration = logContent.spans.length === 0 ? 0 : Math.round(logContent.spans[logContent.spans.length - 1].time);
  ui.stats.innerHTML = `Duration ${duration}ms`;
}

document.addEventListener('DOMContentLoaded', createUI);