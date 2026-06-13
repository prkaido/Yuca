(function () {
  function cleanText(value) {
    let text = String(value ?? "");

    if (/[ÃÂ]/.test(text)) {
      try {
        text = decodeURIComponent(escape(text));
      } catch (_error) {
        return text;
      }
    }

    return text;
  }

  function escapeHtml(value) {
    return cleanText(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function answerCount(answers) {
    return Object.keys(answers).length;
  }

  function blockBounds(index, total, blockSize) {
    return {
      start: index,
      end: Math.min(index + blockSize, total)
    };
  }

  function missingIndexes(answers, start, end) {
    const missing = [];

    for (let i = start; i < end; i += 1) {
      if (!(i in answers)) {
        missing.push(i);
      }
    }

    return missing;
  }

  function setProgress(bar, answers, total) {
    const progress = total === 0 ? 0 : Math.round((answerCount(answers) / total) * 100);
    bar.style.width = `${progress}%`;
    bar.setAttribute("aria-valuenow", String(progress));
  }

  function setMessage(element, type, text) {
    element.className = type ? `message ${type}` : "message";
    element.textContent = text || "";
  }

  function clearMessage(element) {
    setMessage(element, "", "");
  }

  function setBusy(button, busy, busyText) {
    if (!button.dataset.idleText) {
      button.dataset.idleText = button.textContent.trim();
    }

    button.disabled = busy;
    button.textContent = busy ? busyText : button.dataset.idleText;
  }

  async function postJSON(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    let json = null;

    try {
      json = await response.json();
    } catch (_error) {
      throw new Error("El servidor respondio con un formato inesperado.");
    }

    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Error HTTP ${response.status}`);
    }

    return json;
  }

  function showSuccess(card) {
    card.innerHTML = `
      <div class="success-state">
        <h1>Envio guardado</h1>
        <p>Formulario enviado correctamente al servidor local.</p>
        <a href="/">Volver al panel</a>
      </div>
    `;
  }

  function bindEnterToStart(input, startButton) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        startButton.click();
      }
    });
  }

  function speakText(value) {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      return false;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(cleanText(value));
    utterance.lang = "es-CO";
    utterance.rate = 0.86;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
    return true;
  }

  window.DiagnosticUI = {
    answerCount,
    bindEnterToStart,
    blockBounds,
    cleanText,
    clearMessage,
    escapeHtml,
    missingIndexes,
    postJSON,
    setBusy,
    setMessage,
    setProgress,
    showSuccess,
    speakText
  };
})();
