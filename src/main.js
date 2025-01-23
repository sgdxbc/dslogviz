import './style.css'
import instructionHTML from "./instruction.html?raw"

const ui = { title: null, stats: null, view: null, viewStats: null, viewTimeTicks: null, viewNodes: null }

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

  const viewTime = document.createElement('div');
  ui.view.appendChild(viewTime);
  viewTime.id = "time";
  viewTime.className = "row";
  viewTime.innerText = "Time (ms)";

  ui.viewTimeTicks = document.createElement('div');
  viewTime.appendChild(ui.viewTimeTicks);
  ui.viewTimeTicks.className = "timeline-container";

  ui.viewNodes = document.createElement('div');
  ui.view.appendChild(ui.viewNodes);

  document.addEventListener('keydown', (event) => {
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      updateViewTimeRange(event.key);
    }
  });

  renderUI();
}

function processLog(text) {
  const events = [];
  let logOffset = 0;
  const nodes = new Set();
  const nodeSpans = new Map();
  const inflightMessageSend = [];
  const inflightTimerSet = [];
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
    // console.log(event);

    let index = events.length;
    events.push(event);

    let node = null;
    if (event.type === "MessageReceive") {
      node = event.receiveNode;
    }
    if (event.type === "TimerReceive") {
      node = event.node;
    }
    if (node !== null) {
      const lastIndex = nodeSpans.get(node);
      if (lastIndex !== undefined) {
        events[lastIndex].timeEnd = event.time;
        event.previousIndex = lastIndex;
      }
      nodeSpans.set(node, index);
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

  for (const index of nodeSpans.values()) {
    events[index].timeEnd = Infinity;
    // no span keeps track of these last spans so they won't appear when their "tails" are in the view
    // should be minor, but still would be good to be solved
  }
  return { events, offset: logOffset, nodes: new Array(...nodes) };
}

let viewStart = 0, viewEnd = 25;
let nodeElements = new Map();
let eventElements = new Map();
let eventElementsStart = 0, eventElementsEnd = 0;

// calling once per loading log file
function renderUI() {
  ui.title.innerHTML = `<strong>DSLabs Log Visualizer:</strong> ${logName}`;

  const duration = logContent.events.length === 0 ? 0 : Math.round(logContent.events[logContent.events.length - 1].time);
  ui.stats.innerHTML = `<strong>Start</strong> ${new Date(logContent.offset).toLocaleString()} <strong>Duration</strong> ${duration}ms (processing the last message/timer may take a bit more)`;

  ui.viewNodes.innerHTML = "";
  nodeElements = new Map();
  for (const nodeName of logContent.nodes) {
    const node = document.createElement('div');
    ui.viewNodes.appendChild(node);
    node.className = "row";

    const nodeEvents = document.createElement('div');
    node.appendChild(nodeEvents);
    nodeEvents.className = "timeline-container";

    const label = document.createElement('div');
    node.appendChild(label);
    label.className = "node-label";
    label.innerText = nodeName;

    nodeElements.set(nodeName, nodeEvents);
  }

  viewStart = 0;
  viewEnd = 25;
  eventElements = new Map();
  eventElementsStart = 0;
  eventElementsEnd = 0;
  renderView();
}

// calling once per user interaction (e.g. adjust view)
function renderView() {
  const durationMillis = viewEnd - viewStart;

  ui.viewTimeTicks.innerHTML = "";
  const tickMillis = Math.max(Math.floor(durationMillis / 10), 1);
  for (let time = Math.ceil(viewStart / tickMillis) * tickMillis; time < viewEnd; time += tickMillis) {
    const tick = document.createElement('div');
    ui.viewTimeTicks.appendChild(tick);
    tick.className = "tick";
    tick.innerText = `${time}`;
    tick.style.left = styleLeft(time);
  }

  let i;
  for (i = eventElementsStart; i < eventElementsEnd; i += 1) {
    if (logContent.events[i].time >= viewStart) {
      break;
    }
    eventElements.get(i).remove();
    eventElements.delete(i);
  }
  eventElementsStart = i;
  for (; i < eventElementsEnd; i += 1) {
    const event = logContent.events[i];
    if (event.time >= viewEnd) {
      break;
    }
    eventElements.get(i).style.left = styleLeft(event.time);
    if (event.timeEnd !== undefined) {
      eventElements.get(i).style.width = styleWidth(event.time, event.timeEnd);
    }
  }
  const j = i;
  for (; i < eventElementsEnd; i += 1) {
    eventElements.get(i).remove();
    eventElements.delete(i);
  }
  eventElementsEnd = j;

  for (i = eventElementsEnd; i < logContent.events.length; i += 1) {
    const event = logContent.events[i];
    if (event.time >= viewEnd) {
      break;
    }
    const eventElement = createEventElement(event);
    appendEventElement(event, eventElement);

    eventElements.set(i, eventElement);
  }
  eventElementsEnd = i;
  for (i = eventElementsStart; i > 0; i -= 1) {
    const event = logContent.events[i - 1];
    if (event.time < viewStart) {
      break;
    }
    const eventElement = createEventElement(event);
    appendEventElement(event, eventElement);

    eventElements.set(i - 1, eventElement);
  }
  eventElementsStart = i;

  ui.viewStats.innerHTML = `<strong>View Start</strong> ${viewStart}ms <strong>Duration</strong> ${durationMillis}ms`;
}

function styleLeft(time) {
  return `${(time - viewStart) / (viewEnd - viewStart) * 100}%`;
}

function styleWidth(time, timeEnd) {
  return timeEnd === Infinity ? "999px" : `calc(${(timeEnd - time) / (viewEnd - viewStart) * 100}% - 10px)`;
}

function updateViewTimeRange(key) {
  if (key === "ArrowLeft") {
    const offset = Math.min((viewEnd - viewStart) * 0.1, viewStart);
    viewStart -= offset;
    viewEnd -= offset;
  }
  if (key === "ArrowRight") {
    const offset = (viewEnd - viewStart) * 0.1;
    viewStart += offset;
    viewEnd += offset;
  }
  if (key === "ArrowUp") {
    const offset = (viewEnd - viewStart) * 0.33;
    viewStart += offset / 2;
    viewEnd -= offset / 2;
  }
  if (key === "ArrowDown") {
    const offset = (viewEnd - viewStart) * 0.5;
    const leftOffset = Math.min(offset / 2, viewStart);
    viewStart -= leftOffset;
    viewEnd += offset - leftOffset;
  }
  renderView();
}

function createEventElement(event) {
  const eventElement = document.createElement('div');
  eventElement.style.left = styleLeft(event.time);

  if (event.type.endsWith("Receive")) {
    eventElement.className = "span";
    eventElement.innerText = event.name;
    eventElement.style.width = styleWidth(event.time, event.timeEnd);
    eventElement.style.background = `linear-gradient(to left, hsl(0 0 0 / 0), ${colorByName(event.name)} max(50px, 20%))`;
  } else {
    eventElement.className = "event";

    const icon = document.createElement('div');
    eventElement.appendChild(icon);
    icon.style.color = `hsl(from ${colorByName(event.name)} h s calc(l - 10))`;
    icon.classList.add("fa-solid");
    if (event.type === "MessageSend") {
      icon.classList.add("fa-envelope");
    }
    if (event.type === "TimerSet") {
      icon.classList.add("fa-clock");
    }

    const name = document.createElement('div');
    eventElement.appendChild(name);
    name.innerText = event.name;
  }
  return eventElement;
}

function appendEventElement(event, eventElement) {
  let node = null;
  if (event.type === "MessageReceive") {
    node = event.receiveNode;
  }
  if (event.type === "MessageSend") {
    node = event.sendNode;
  }
  if (event.type.startsWith("Timer")) {
    node = event.node;
  }
  if (node !== null) {
    nodeElements.get(node).appendChild(eventElement);
  }
}

// https://stackoverflow.com/a/34842797
const hashCode = s => s.split('').reduce((a, b) => (((a << 5) - a) + b.charCodeAt(0)) | 0, 0);

function colorByName(name) {
  return `hsl(${hashCode(name)} 100 95)`;
}

document.addEventListener('DOMContentLoaded', createUI);