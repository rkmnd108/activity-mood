"use strict";
(async () => {
  for (const name of ["phase3", "phase6", "phase8"]) {
    const frame = document.createElement("iframe"); frame.src = `${name}.html`; frame.width = 1550; frame.height = 1100;
    await new Promise(resolve => { frame.onload = resolve; document.body.append(frame); });
    let text = "";
    for (let i = 0; i < 300; i++) {
      text = frame.contentDocument.getElementById("result")?.textContent || "";
      if (text.includes("すべて成功") || text.includes("FAIL")) break;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const li = document.createElement("li"); li.textContent = `${name}: ${text}`; document.getElementById("results").append(li);
    if (!text.includes("すべて成功")) throw new Error(`${name}: ${text}`);
    frame.hidden = true;
  }
  document.getElementById("result").textContent = "Chromeの全テスト成功";
})().catch(error => { document.getElementById("result").textContent = `FAIL: ${error.message}`; });
