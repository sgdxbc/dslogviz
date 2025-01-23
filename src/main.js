import './style.css';
import instructionHTML from "./instruction.html?raw";

function processLog(text) {
  const logEvents = [];
  let logOffset = 0;
  const nodes = new Set();
  for (let line of text.split('\n')) {
    if (line === "") {
      continue;
    }
    const reLevel = String.raw`\[(FINEST|FINER) *\]`;
    const reTime = String.raw`\[(\d\d\d\d-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3})(\d{6})\]`;
    const reSource = String.raw`\[([\w\.]*)\]`;
    const reMessage = String.raw`(MessageSend|MessageReceive)\((\w+) -> (\w+), (\w+)\((.*)\)\)`;
    const reTimer = String.raw`(TimerSet|TimerReceive)\(-> (\w+), (\w+)\((.*)\)\)`;
    const reOther = String.raw`(.*)`;
    const m = line.match(new RegExp(`^${reLevel} ${reTime} ${reSource} (${reMessage}|${reTimer}|${reOther})`));
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
    // console.log(event);
    logEvents.push(event);
  }

  const viewSpans = [];
  const nodeLastSpans = new Map();
  const inflightEvents = [];
  for (const event of logEvents) {
    if (event.type === "MessageReceive" || event.type === "TimerReceive") {
      const span = { endTime: Infinity, ...event };
      viewSpans.push(span);

      const node = event.type === "MessageReceive" ? event.receiveNode : event.node;
      if (nodeLastSpans.get(node) !== undefined) {
        nodeLastSpans.get(node).endTime = event.time;
      }
      nodeLastSpans.set(node, span);

      for (const [i, inflightEvent] of inflightEvents.entries()) {
        // is this condition too loose?
        if (inflightEvent.name === event.name && inflightEvent.data === event.data) {
          const sourceNode = inflightEvent.type === "MessageSend" ? inflightEvent.sendNode : inflightEvent.node;
          viewSpans.push({
            type: "->",
            time: inflightEvent.time, endTime: event.time,
            sourceNode, destinationNode: node,
            name: event.name, data: event.data
          });
          inflightEvents.splice(i, 1);
        }
      }
    } else {
      viewSpans.push({ endTime: event.time, ...event });
      if (event.type === "MessageSend" || event.type === "TimerSet") {
        inflightEvents.push(event);
      }
    }
  }

  viewSpans.sort((s1, s2) => s1.time - s2.time);
  const endIndexes = viewSpans.entries().map(([i, span]) => { return { endTime: span.endTime, index: i }; }).toArray();
  endIndexes.sort((s1, s2) => s1.endTime - s2.endTime);
  return { spans: viewSpans, endSpans: endIndexes, offset: logOffset, nodes: new Array(...nodes) };
}

const ui = { title: null, stats: null, view: null, viewStats: null, viewTimeTicks: null, viewSpans: null };

let logName = "lab0-test1.txt";
let logContent =
  processLog(`[FINEST ] [2025-01-20 15:01:01.173989014] [dslabs.framework.Node] MessageSend(client1 -> pingserver, PingRequest(ping=PingApplication.Ping(value=Hello, World!)))
[FINEST ] [2025-01-20 15:01:01.182533829] [dslabs.framework.Node] TimerSet(-> client1, PingTimer(ping=PingApplication.Ping(value=Hello, World!)))
[FINER  ] [2025-01-20 15:01:01.188420714] [dslabs.framework.Node] MessageReceive(client1 -> pingserver, PingRequest(ping=PingApplication.Ping(value=Hello, World!)))
[FINEST ] [2025-01-20 15:01:01.191562866] [dslabs.framework.Node] MessageSend(pingserver -> client1, PongReply(pong=PingApplication.Pong(value=Hello, World!)))
[FINER  ] [2025-01-20 15:01:01.192877030] [dslabs.framework.Node] MessageReceive(pingserver -> client1, PongReply(pong=PingApplication.Pong(value=Hello, World!)))
[FINER  ] [2025-01-20 15:01:01.195212143] [dslabs.framework.Node] TimerReceive(-> client1, PingTimer(ping=PingApplication.Ping(value=Hello, World!)))
`);

// calling once globally
function createUI() {
  const app = document.querySelector("#app");
  if (app === null) {
    return;
  }

  ui.title = document.createElement("div");
  ui.title.id = "title";
  app.appendChild(ui.title);

  const uploadButtonLabel = document.createElement('label');
  app.appendChild(uploadButtonLabel);
  uploadButtonLabel.id = "upload";
  uploadButtonLabel.innerText = "Load Log File";
  uploadButtonLabel.htmlFor = "upload-log-file";

  const uploadButton = document.createElement("input");
  uploadButtonLabel.appendChild(uploadButton);
  uploadButton.id = "upload-log-file";
  uploadButton.type = "file";
  uploadButton.addEventListener('change', () => {
    if (uploadButton.files === null) {
      return;
    }
    console.assert(uploadButton.files.length == 1);
    const file = uploadButton.files[0];

    const fileReader = new FileReader();
    fileReader.onload = () => {
      logName = file.name;
      ui.title.innerHTML = "Processing";
      requestAnimationFrame(() => {
        logContent = processLog(fileReader.result);
        renderUI();
      });
    };
    ui.title.innerHTML = "Loading";
    fileReader.readAsText(file);
  });

  const instruction = document.createElement('div');
  app.appendChild(instruction);
  instruction.innerHTML = instructionHTML;

  ui.stats = document.createElement('div');
  app.appendChild(ui.stats);

  ui.view = document.createElement('div');
  app.appendChild(ui.view);
  ui.view.id = "view";

  ui.viewStats = document.createElement('div');
  ui.view.appendChild(ui.viewStats);
  ui.viewStats.id = "view-stats";

  const viewTime = document.createElement('div');
  ui.view.appendChild(viewTime);
  viewTime.id = "time";
  viewTime.className = "row";
  viewTime.innerText = "Time (ms)";

  ui.viewTimeTicks = document.createElement('div');
  viewTime.appendChild(ui.viewTimeTicks);

  ui.viewSpans = document.createElement('div');
  ui.view.appendChild(ui.viewSpans);

  document.addEventListener('keydown', (event) => {
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      updateViewTimeRange(event.key);
    }
  });

  renderUI();
}

let viewStartTime = -1, viewEndTime = -1;
let nodeRows = null;
let spanElements = null;
let maxStartIndex = -1, minEndIndex = -1;

// calling once per loading log file
function renderUI() {
  ui.title.innerHTML = `<strong>DSLabs Log Visualizer:</strong> ${logName}`;

  let duration = 0;
  for (let i = logContent.endSpans.length; i > 0; i -= 1) {
    const endTime = logContent.endSpans[i - 1].endTime;
    if (endTime === Infinity) {
      continue;
    }
    duration = endTime;
    break;
  }
  ui.stats.innerHTML = `<strong>Start</strong> ${new Date(logContent.offset).toLocaleString()} <strong>Duration</strong> ${duration}ms (processing the last message/timer may take a bit more)`;

  ui.viewSpans.innerHTML = "";
  nodeRows = new Map();
  for (const [index, nodeName] of logContent.nodes.entries()) {
    nodeRows.set(nodeName, index);

    const node = document.createElement('div');
    ui.viewSpans.appendChild(node);
    node.className = "row";
    node.innerText = nodeName;
  }

  viewStartTime = 0;
  viewEndTime = 25;
  maxStartIndex = 0;
  minEndIndex = 0;
  spanElements = new Map();
  renderView();
}

// calling once per user interaction (e.g. adjust view)
function renderView() {
  const durationMillis = viewEndTime - viewStartTime;

  ui.viewTimeTicks.innerHTML = "";
  const tickMillis = Math.max(Math.floor(durationMillis / 10), 1);
  for (let time = Math.ceil(viewStartTime / tickMillis) * tickMillis; time < viewEndTime; time += tickMillis) {
    const tick = document.createElement('div');
    ui.viewTimeTicks.appendChild(tick);
    tick.className = "tick";
    tick.innerText = `${time}`;
    tick.style.left = styleLeft(time);
  }

  let i;
  for (i = maxStartIndex; i < logContent.spans.length; i += 1) {
    const span = logContent.spans[i];
    if (span.time >= viewEndTime) {
      break;
    }
    const element = createSpanElement(span);
    ui.viewSpans.appendChild(element);
    spanElements.set(i, element);
  }
  maxStartIndex = i;
  for (i = minEndIndex; i > 0; i -= 1) {
    const endSpan = logContent.endSpans[i - 1];
    if (endSpan.endTime < viewStartTime) {
      break;
    }
    if (spanElements.has(endSpan.index)) {
      console.warn("Duplicated rendering span", logContent.spans[endSpan.index]);
      continue;
    }
    const element = createSpanElement(logContent.spans[endSpan.index]);
    ui.viewSpans.appendChild(element);
    spanElements.set(endSpan.index, element);
  }
  minEndIndex = i;

  ui.viewStats.innerHTML = `<strong>View Start</strong> ${viewStartTime}ms <strong>Duration</strong> ${durationMillis}ms`;
}

function styleLeft(time) {
  return `${(time - viewStartTime) / (viewEndTime - viewStartTime) * 90 + 5}%`;
}

function styleTop(row, offset = 0) {
  return `${row * 173 + 170 + offset}px`;
}

function styleWidth(time, timeEnd) {
  return timeEnd === Infinity ? "999px" : `calc(${(timeEnd - time) / (viewEndTime - viewStartTime) * 100}% - 10px)`;
}

function updateViewTimeRange(key) {
  if (key === "ArrowLeft") {
    const offset = Math.min((viewEndTime - viewStartTime) * 0.1, viewStartTime);
    viewStartTime -= offset;
    viewEndTime -= offset;
  }
  if (key === "ArrowRight") {
    const offset = (viewEndTime - viewStartTime) * 0.1;
    viewStartTime += offset;
    viewEndTime += offset;
  }
  if (key === "ArrowUp") {
    const offset = (viewEndTime - viewStartTime) * 0.33;
    viewStartTime += offset / 2;
    viewEndTime -= offset / 2;
  }
  if (key === "ArrowDown") {
    const offset = (viewEndTime - viewStartTime) * 0.5;
    const leftOffset = Math.min(offset / 2, viewStartTime);
    viewStartTime -= leftOffset;
    viewEndTime += offset - leftOffset;
  }
  renderView();
}

function createSpanElement(span) {
  const eventElement = document.createElement('div');
  eventElement.style.left = styleLeft(span.time);

  if (span.type.endsWith("Receive")) {
    eventElement.className = "span";
    eventElement.innerText = span.name;
    eventElement.style.width = styleWidth(span.time, span.endTime);
    eventElement.style.background = `linear-gradient(to left, hsl(0 0 0 / 0), ${colorByName(span.name)} max(50px, 20%))`;
  } else if (span.type === "->") {

  } else {
    eventElement.className = "event";

    const icon = document.createElement('div');
    eventElement.appendChild(icon);
    icon.style.color = `hsl(from ${colorByName(span.name)} h s calc(l - 10))`;
    icon.classList.add("fa-solid");
    const name = document.createElement('div');
    eventElement.appendChild(name);
    name.innerText = span.name;

    if (span.type === "MessageSend") {
      icon.classList.add("fa-envelope");
    }
    if (span.type === "TimerSet") {
      icon.classList.add("fa-clock");
    }
  }

  if (span.type === "MessageReceive") {
    eventElement.style.top = styleTop(nodeRows.get(span.receiveNode));
  }
  if (span.type === "MessageSend") {
    eventElement.style.top = styleTop(nodeRows.get(span.sendNode));
  }
  if (span.type.startsWith("Timer")) {
    eventElement.style.top = styleTop(nodeRows.get(span.node));
  }
  return eventElement;
}

// https://stackoverflow.com/a/34842797
const hashCode = s => s.split('').reduce((a, b) => (((a << 5) - a) + b.charCodeAt(0)) | 0, 0);

function colorByName(name) {
  return `hsl(${hashCode(name)} 100 95)`;
}

document.addEventListener('DOMContentLoaded', createUI);