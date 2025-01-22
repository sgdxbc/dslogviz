const ui = { header: null, stats: null, viewStats: null, viewTimeTicks: null, viewNodes: new Map() }

let logName = "lab0-test1.txt";
let logContent =
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
      ui.header.innerHTML = "Processing";
      requestAnimationFrame(() => {
        logContent = processLog(fileReader.result);
        renderUI();
      });
    };
    ui.header.innerHTML = "Loading";
    fileReader.readAsText(file);
  });
  const uploadButtonLabel = document.createElement('label');
  uploadButtonLabel.innerText = "Log File";
  uploadButtonLabel.htmlFor = "upload-log-file";
  uploadButtonLabel.hidden = true;
  app.appendChild(uploadButtonLabel);
  app.appendChild(uploadButton);

  const instruction = document.createElement('div');
  instruction.innerHTML = `<ul>
  <li>Usage: run <code>run-tests.py</code> with additional arguments <code>-g FINEST 2>$LOG_FILE</code>, for example
  <pre>./run-tests.py --lab 0 --test 1 -g FINEST 2>lab0-test1.txt</pre>
  then load the dumped log file here.</li>
  <li>Only logs are supported. Use e.g. <code>LOG.info(...)</code> instead of <code>System.out.println(...)</code> to produce custom logs.</li>
  <li>Use left and right arrow keys to move around the timeline. Use up and down arrow keys to zoom in and zoom out the timeline.</li>
  <li>This visualization tool is only for run tests; do not use it with search tests. Actually, never enable logging for search tests.</li>
  <li>The visualization cannot identify the idle period of nodes with the logs produced by the testing framework and assumes the nodes are always processing messages and timers.
  The actual processing may be ended before the rendered time (which is implied by the fading out).</li>
  <li>Logging may affect the performance and concurrency of the solution. Make sure to rerun the test with logging disabled after it passes with logging enabled.</li>
  <li>This visualization tool is not intended to serve as an end-to-end debugging solution for run tests, different from the DSLabs' built-in visualization (for search tests).
  The users are still expected to understand the logs and be able to manually exam the logs (and probably actually manually exam the simple ones), and only use this as a viewer to perceive the logs more efficiently.</li>
</ul>`;
  app.appendChild(instruction);

  ui.stats = document.createElement('div');
  app.appendChild(ui.stats);

  const view = document.createElement('div');
  view.style.margin = "10px";
  view.style.border = "1px solid";
  app.appendChild(view);

  ui.viewStats = document.createElement('div');
  view.appendChild(ui.viewStats);

  const viewTime = document.createElement('div');
  view.appendChild(viewTime);
  viewTime.innerText = "Time (ms)";
  viewTime.style.height = "50px";
  viewTime.style.marginBottom = "10px";
  viewTime.style.borderBottomStyle = "solid";
  viewTime.style.lineHeight = "40px";
  ui.viewTimeTicks = document.createElement('div');
  viewTime.appendChild(ui.viewTimeTicks);
  ui.viewTimeTicks.style.position = "relative";
  ui.viewTimeTicks.style.marginLeft = "50px";
  ui.viewTimeTicks.style.marginRight = "50px";

  document.addEventListener('keydown', (event) => {
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      updateViewTimeRange(event.key);
    }
  });

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
  return { spans, events, offset: logOffset, nodes: new Array(...nodes) };
}

let viewStart = 0, viewEnd = 25;

function renderUI() {
  ui.header.innerHTML = `<strong>DSLabs Log Visualizer:</strong> ${logName}`;
  const duration = logContent.spans.length === 0 ? 0 : Math.round(logContent.spans[logContent.spans.length - 1].time);
  ui.stats.innerHTML = `<strong>Start</strong> ${new Date(logContent.offset).toLocaleString()} <strong>Duration</strong> ${duration}ms`;

  viewStart = 0;
  viewEnd = 25;
  renderView();
}

function renderView() {
  const durationMillis = viewEnd - viewStart;
  ui.viewStats.innerHTML = `<strong>View Duration</strong> ${durationMillis}ms`;

  ui.viewTimeTicks.innerHTML = "";
  const tickMillis = Math.max(Math.floor(durationMillis / 10), 1);
  for (let time = Math.ceil(viewStart / tickMillis) * tickMillis; time < viewEnd; time += tickMillis) {
    const tick = document.createElement('div');
    ui.viewTimeTicks.appendChild(tick);
    tick.innerText = `${time}`;
    tick.style.position = "absolute";
    tick.style.left = leftPosition(time);
    tick.style.top = "-20px";
  }
}

function leftPosition(time) {
  return `${(time - viewStart) / (viewEnd - viewStart) * 100}%`;
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

document.addEventListener('DOMContentLoaded', createUI);