/*
 * PdfTeXEngine.js — wrapper for the SwiftLaTeX pdfTeX WASM engine.
 *
 * Background
 * ----------
 * The SwiftLaTeX distribution ships TWO JavaScript files per engine:
 *
 *   1. `swiftlatexpdftex.js` — the *inner* Emscripten worker. It is meant to be
 *      run as a dedicated Web Worker. It speaks a `{cmd: "..."}` message
 *      protocol (`compilelatex`, `writefile`, `mkdir`, `setmainfile`,
 *      `settexliveurl`, `flushcache`, `grace`) and posts back
 *      `{result, status, log, pdf, cmd}` messages. It also posts a bare
 *      `{result: "ok"}` from Emscripten's `postRun` once the WASM module has
 *      booted.
 *
 *   2. `PdfTeXEngine.js` — this *wrapper* class. It runs on whichever thread
 *      imports it, spawns the inner worker, and exposes the high-level API
 *      (`loadEngine`, `writeMemFSFile`, `setEngineMainFile`, `compileLaTeX`, …)
 *      that ComdTeX's `src/wasmTex.worker.ts` expects via the global
 *      `self.PdfTeXEngine` constructor.
 *
 * ComdTeX previously bundled ONLY file (1) under the name `swiftlatexpdftex.js`
 * and `importScripts`'d it expecting a `PdfTeXEngine` global — which that file
 * never defines. The constructor lookup failed, the engine reported
 * "unavailable", and WASM PDF compilation silently never ran.
 *
 * This wrapper closes that gap. Its message protocol is reproduced verbatim
 * from the bundled `swiftlatexpdftex.js` (the contract was read directly out of
 * that file's `onmessage` dispatch and `postMessage` calls), so it is faithful
 * to the binary actually shipped here — not a guess.
 *
 * Loaded as a classic script via `importScripts(...)` inside the ComdTeX
 * worker, it registers `self.PdfTeXEngine`.
 */

(function () {
  "use strict";

  // Engine lifecycle states (mirrors upstream SwiftLaTeX).
  var EngineStatus = { Init: 1, Ready: 2, Busy: 3, Error: 4 };

  // The inner Emscripten worker is resolved relative to this wrapper script so
  // that a single `importScripts("/wasm-tex/PdfTeXEngine.js")` is enough — the
  // wrapper finds its sibling `swiftlatexpdftex.js` (and that file in turn
  // fetches `swiftlatexpdftex.wasm` from the same directory via Emscripten's
  // default locateFile).
  function resolveWorkerUrl() {
    // `self.location` inside a worker that imported us points at the importing
    // worker's URL, not ours. Pin to the known public path instead.
    return "/wasm-tex/swiftlatexpdftex.js";
  }

  function PdfTeXEngine() {
    this.latexWorker = undefined;
    this.latexWorkerStatus = EngineStatus.Init;
  }

  PdfTeXEngine.prototype.loadEngine = function loadEngine() {
    var self_ = this;
    if (self_.latexWorker !== undefined) {
      return Promise.reject(new Error("Other instance is running, abort()"));
    }
    self_.latexWorkerStatus = EngineStatus.Init;
    return new Promise(function (resolve, reject) {
      self_.latexWorker = new Worker(resolveWorkerUrl());
      self_.latexWorker.onmessage = function (ev) {
        var data = ev.data;
        var cmd = data.cmd;
        // The inner worker's `postRun` posts a bare `{result:"ok"}` with no
        // `cmd` field once the WASM module has booted — that is our readiness
        // signal.
        if (typeof cmd === "undefined" && data.result === "ok") {
          self_.latexWorkerStatus = EngineStatus.Ready;
          resolve();
        } else {
          self_.latexWorkerStatus = EngineStatus.Error;
          reject(new Error("loadEngine: unexpected boot message"));
        }
      };
      self_.latexWorker.onerror = function (err) {
        self_.latexWorkerStatus = EngineStatus.Error;
        reject(err instanceof Error ? err : new Error(String(err && err.message || err)));
      };
    }).then(function () {
      // After boot, install the steady-state handler (set per-request below).
      self_.latexWorker.onmessage = function () {};
      self_.latexWorker.onerror = function () {};
    });
  };

  PdfTeXEngine.prototype.isReady = function isReady() {
    return this.latexWorkerStatus === EngineStatus.Ready;
  };

  PdfTeXEngine.prototype.checkEngineStatus = function checkEngineStatus() {
    if (!this.isReady()) {
      throw new Error("Engine is still spinning or not ready yet!");
    }
  };

  PdfTeXEngine.prototype.setEngineMainFile = function setEngineMainFile(filename) {
    this.checkEngineStatus();
    if (this.latexWorker !== undefined) {
      this.latexWorker.postMessage({ cmd: "setmainfile", url: filename });
    }
  };

  PdfTeXEngine.prototype.writeMemFSFile = function writeMemFSFile(filename, srccode) {
    this.checkEngineStatus();
    if (this.latexWorker !== undefined) {
      this.latexWorker.postMessage({ cmd: "writefile", url: filename, src: srccode });
    }
  };

  PdfTeXEngine.prototype.makeMemFSFolder = function makeMemFSFolder(folder) {
    this.checkEngineStatus();
    if (this.latexWorker !== undefined) {
      if (folder === "" || folder === "/") {
        return;
      }
      this.latexWorker.postMessage({ cmd: "mkdir", url: folder });
    }
  };

  PdfTeXEngine.prototype.flushCache = function flushCache() {
    this.checkEngineStatus();
    if (this.latexWorker !== undefined) {
      this.latexWorker.postMessage({ cmd: "flushcache" });
    }
  };

  PdfTeXEngine.prototype.setTexliveEndpoint = function setTexliveEndpoint(url) {
    if (this.latexWorker !== undefined) {
      this.latexWorker.postMessage({ cmd: "settexliveurl", url: url });
    }
  };

  PdfTeXEngine.prototype.compileLaTeX = function compileLaTeX() {
    var self_ = this;
    this.checkEngineStatus();
    this.latexWorkerStatus = EngineStatus.Busy;
    return new Promise(function (resolve, reject) {
      self_.latexWorker.onmessage = function (ev) {
        var data = ev.data;
        if (data.cmd !== "compile") {
          // Ignore stray acks (writefile/mkdir results), keep waiting.
          return;
        }
        self_.latexWorkerStatus = EngineStatus.Ready;
        self_.latexWorker.onmessage = function () {};
        self_.latexWorker.onerror = function () {};
        var npages = 0;
        var result = {
          // Map the inner worker's `result` string to a numeric status
          // (0 == success) that `src/wasmTex.worker.ts` checks against.
          status: data.result === "ok" ? 0 : (typeof data.status === "number" ? data.status : -1),
          log: data.log || "",
          pdf: undefined,
        };
        if (data.result === "ok" && data.pdf) {
          result.pdf = new Uint8Array(data.pdf);
        }
        resolve(result);
      };
      self_.latexWorker.onerror = function (err) {
        self_.latexWorkerStatus = EngineStatus.Error;
        reject(err instanceof Error ? err : new Error(String(err && err.message || err)));
      };
      self_.latexWorker.postMessage({ cmd: "compilelatex" });
    });
  };

  PdfTeXEngine.prototype.closeWorker = function closeWorker() {
    if (this.latexWorker !== undefined) {
      try {
        this.latexWorker.postMessage({ cmd: "grace" });
      } catch (e) {
        /* ignore */
      }
      this.latexWorker = undefined;
    }
    this.latexWorkerStatus = EngineStatus.Init;
  };

  // Register the global the ComdTeX worker looks for.
  self.PdfTeXEngine = PdfTeXEngine;
})();
