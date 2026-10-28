import AppKit
import Darwin
import Foundation

private let appName = "Ollama Studio"
private let menuPort = 3210
private let autoOpenDefaultsKey = "autoOpenWeb"

private func localized(_ chinese: String, _ english: String) -> String {
    let preferred = Locale.preferredLanguages.first?.lowercased() ?? "en"
    return preferred.hasPrefix("zh") ? chinese : english
}

private func symbol(_ name: String) -> NSImage? {
    NSImage(systemSymbolName: name, accessibilityDescription: nil)
}

private enum ServiceState {
    case starting
    case restarting
    case running
    case stopped
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let port = menuPort
    private var baseURL: URL { URL(string: "http://127.0.0.1:\(port)")! }

    private var statusItem: NSStatusItem!
    private var statusMenuItem: NSMenuItem!
    private var restartMenuItem: NSMenuItem!
    private var autoOpenMenuItem: NSMenuItem!

    private var serverProcess: Process?
    private var ownsServer = false
    private var serverReady = false
    private var serviceState: ServiceState = .starting
    private var runningModelCount: Int?

    private var logURL: URL!
    private var menuLogURL: URL!
    private var logHandle: FileHandle?
    private var healthTimer: Timer?
    private var readinessAttempts = 0
    private var didEvaluateAutoOpen = false
    private var isQuitting = false
    private var isRestarting = false
    private var didReportUnexpectedExit = false

    // MARK: - Lifecycle

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        prepareLog()
        appendMenuLog("application launched")
        configureStatusItem()
        configureMenu()
        beginStartup()

        let timer = Timer(timeInterval: 5, target: self, selector: #selector(healthTick), userInfo: nil, repeats: true)
        RunLoop.main.add(timer, forMode: .common)
        healthTimer = timer
    }

    func applicationWillTerminate(_ notification: Notification) {
        isQuitting = true
        appendMenuLog("application terminating")
        healthTimer?.invalidate()
        if ownsServer, let process = serverProcess, process.isRunning {
            process.terminate()
            let deadline = Date().addingTimeInterval(2)
            while process.isRunning && Date() < deadline {
                usleep(100_000)
            }
            if process.isRunning {
                kill(process.processIdentifier, SIGKILL)
            }
        }
    }

    // MARK: - UI

    private func configureStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        guard let button = statusItem.button else { return }

        let image = NSImage(size: NSSize(width: 18, height: 18))
        for name in ["menu-iconTemplate", "menu-iconTemplate@2x"] {
            guard
                let url = Bundle.main.url(forResource: name, withExtension: "png"),
                let data = try? Data(contentsOf: url),
                let representation = NSBitmapImageRep(data: data)
            else { continue }
            representation.size = NSSize(width: 18, height: 18)
            image.addRepresentation(representation)
        }

        if image.representations.isEmpty {
            button.title = "OS"
        } else {
            image.isTemplate = true
            button.image = image
        }
        button.toolTip = appName
        button.setAccessibilityLabel(appName)
    }

    private func configureMenu() {
        let menu = NSMenu()

        let openItem = NSMenuItem(
            title: localized("打开 Web 面板", "Open Web Dashboard"),
            action: #selector(openWeb),
            keyEquivalent: "o"
        )
        openItem.target = self
        openItem.image = symbol("safari")
        menu.addItem(openItem)

        statusMenuItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
        statusMenuItem.isEnabled = false
        menu.addItem(statusMenuItem)

        menu.addItem(.separator())

        restartMenuItem = NSMenuItem(
            title: localized("重启本地服务", "Restart Local Service"),
            action: #selector(restartServer),
            keyEquivalent: "r"
        )
        restartMenuItem.target = self
        restartMenuItem.image = symbol("arrow.clockwise")
        menu.addItem(restartMenuItem)

        let logItem = NSMenuItem(
            title: localized("打开服务日志", "Open Service Log"),
            action: #selector(openLog),
            keyEquivalent: "l"
        )
        logItem.target = self
        logItem.image = symbol("doc.text")
        menu.addItem(logItem)

        let copyItem = NSMenuItem(
            title: localized("复制 Web 地址", "Copy Web Address"),
            action: #selector(copyWebAddress),
            keyEquivalent: "c"
        )
        copyItem.target = self
        copyItem.image = symbol("doc.on.doc")
        menu.addItem(copyItem)

        menu.addItem(.separator())

        autoOpenMenuItem = NSMenuItem(
            title: localized("启动时自动打开 Web", "Open Web on Launch"),
            action: #selector(toggleAutoOpen),
            keyEquivalent: ""
        )
        autoOpenMenuItem.target = self
        autoOpenMenuItem.state = autoOpenEnabled ? .on : .off
        menu.addItem(autoOpenMenuItem)

        menu.addItem(.separator())

        let aboutItem = NSMenuItem(
            title: localized("关于 Ollama Studio", "About Ollama Studio"),
            action: #selector(showAbout),
            keyEquivalent: ""
        )
        aboutItem.target = self
        aboutItem.image = symbol("info.circle")
        menu.addItem(aboutItem)

        let quitItem = NSMenuItem(
            title: localized("退出 Ollama Studio", "Quit Ollama Studio"),
            action: #selector(quitApp),
            keyEquivalent: "q"
        )
        quitItem.target = self
        quitItem.image = symbol("power")
        menu.addItem(quitItem)

        statusItem.menu = menu
        updateStatus()
    }

    private var autoOpenEnabled: Bool {
        if UserDefaults.standard.object(forKey: autoOpenDefaultsKey) == nil {
            return true
        }
        return UserDefaults.standard.bool(forKey: autoOpenDefaultsKey)
    }

    private func activateApp() {
        if #available(macOS 14.0, *) {
            NSApp.activate()
        } else {
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    private func showAlert(title: String, message: String) {
        activateApp()
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = title
        alert.informativeText = message
        alert.addButton(withTitle: localized("好", "OK"))
        alert.runModal()
    }

    // MARK: - Service lifecycle

    private func beginStartup() {
        appendMenuLog("checking for an existing service on port \(port)")
        serviceState = .starting
        updateStatus()
        checkHealth { [weak self] healthy in
            guard let self, !self.isQuitting else { return }
            if healthy {
                self.attachToExistingServer()
            } else {
                self.launchBundledServer()
            }
        }
    }

    private func attachToExistingServer() {
        appendMenuLog("attached to an existing service on port \(port)")
        ownsServer = false
        serverReady = true
        serviceState = .running
        updateStatus()
        refreshRunningModels()
        autoOpenIfNeeded()
    }

    private func launchBundledServer() {
        appendMenuLog("starting bundled service")
        isRestarting = false
        guard let resources = Bundle.main.resourceURL else {
            serviceState = .stopped
            updateStatus()
            showAlert(
                title: localized("应用资源缺失", "Application resources missing"),
                message: localized("无法定位应用资源目录。", "The application resources directory could not be located.")
            )
            return
        }

        let serverDirectory = resources.appendingPathComponent("server", isDirectory: true)
        let scriptURL = serverDirectory.appendingPathComponent("server.js")
        let nodeURL = resources.appendingPathComponent("runtime/node")

        guard FileManager.default.isExecutableFile(atPath: nodeURL.path) else {
            serviceState = .stopped
            updateStatus()
            showAlert(
                title: localized("内置运行时缺失", "Bundled runtime missing"),
                message: localized("找不到内置 Node 运行时：\(nodeURL.path)", "Bundled Node runtime not found: \(nodeURL.path)")
            )
            return
        }
        guard FileManager.default.fileExists(atPath: scriptURL.path) else {
            serviceState = .stopped
            updateStatus()
            showAlert(
                title: localized("服务脚本缺失", "Service script missing"),
                message: localized("找不到服务脚本：\(scriptURL.path)", "Service script not found: \(scriptURL.path)")
            )
            return
        }

        let process = Process()
        process.executableURL = nodeURL
        process.arguments = [scriptURL.path]
        process.currentDirectoryURL = serverDirectory

        var environment = ProcessInfo.processInfo.environment
        environment["PORT"] = String(port)
        environment["HOST"] = "127.0.0.1"
        environment["NODE_ENV"] = "production"
        // Finder launches apps with a minimal PATH; make the common Ollama CLI locations visible.
        let inheritedPath = environment["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"
        environment["PATH"] = "/opt/homebrew/bin:/usr/local/bin:\(inheritedPath)"
        environment.removeValue(forKey: "PROXY_TOKEN")
        environment.removeValue(forKey: "VITE_PROXY_TOKEN")
        process.environment = environment

        if let logHandle {
            process.standardOutput = logHandle
            process.standardError = logHandle
        }

        process.terminationHandler = { [weak self] finishedProcess in
            DispatchQueue.main.async {
                self?.serverDidExit(finishedProcess)
            }
        }

        do {
            try process.run()
        } catch {
            serviceState = .stopped
            updateStatus()
            showAlert(
                title: localized("本地服务启动失败", "Local service failed to start"),
                message: "\(error.localizedDescription)\n\n\(logURL.path)"
            )
            return
        }

        serverProcess = process
        ownsServer = true
        serverReady = false
        serviceState = .starting
        didReportUnexpectedExit = false
        appendMenuLog("service process started pid \(process.processIdentifier)")
        updateStatus()
        waitForServerReady()
    }

    private func waitForServerReady() {
        readinessAttempts = 0
        pollReadiness()
    }

    private func pollReadiness() {
        guard !isQuitting else { return }
        readinessAttempts += 1
        checkHealth { [weak self] healthy in
            guard let self, !self.isQuitting else { return }
            if healthy {
                self.serverReady = true
                self.serviceState = .running
                self.isRestarting = false
                self.appendMenuLog("service is ready on port \(self.port)")
                self.updateStatus()
                self.refreshRunningModels()
                self.autoOpenIfNeeded()
                return
            }

            if self.readinessAttempts < 60 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
                    self?.pollReadiness()
                }
            } else {
                self.serverReady = false
                self.serviceState = .stopped
                self.isRestarting = false
                self.updateStatus()
                self.showAlert(
                    title: localized("本地服务启动超时", "Local service startup timed out"),
                    message: localized(
                        "请打开服务日志查看原因。\n\n\(self.logURL.path)",
                        "Open the service log for details.\n\n\(self.logURL.path)"
                    )
                )
            }
        }
    }

    private func serverDidExit(_ process: Process) {
        guard !isQuitting else { return }
        guard process === serverProcess else {
            appendMenuLog("ignoring exit from stale service process pid \(process.processIdentifier)")
            return
        }
        appendMenuLog("service process exited with status \(process.terminationStatus)")
        serverProcess = nil
        ownsServer = false
        serverReady = false
        runningModelCount = nil
        serviceState = .stopped
        updateStatus()

        if isRestarting {
            return
        }
        if didReportUnexpectedExit {
            return
        }
        didReportUnexpectedExit = true

        activateApp()
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = localized("本地服务已停止", "Local service stopped")
        alert.informativeText = localized(
            "服务进程意外退出。请查看日志了解原因。",
            "The service process exited unexpectedly. Check the log for details."
        )
        alert.addButton(withTitle: localized("打开日志", "Open Log"))
        alert.addButton(withTitle: localized("关闭", "Close"))
        if alert.runModal() == .alertFirstButtonReturn {
            openLog()
        }
    }

    private func stopServer(completion: @escaping () -> Void) {
        guard let process = serverProcess, process.isRunning else {
            serverProcess = nil
            ownsServer = false
            serverReady = false
            completion()
            return
        }

        let pid = process.processIdentifier
        process.terminate()

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let deadline = Date().addingTimeInterval(2)
            while process.isRunning && Date() < deadline {
                usleep(100_000)
            }
            if process.isRunning {
                kill(pid, SIGKILL)
            }
            DispatchQueue.main.async {
                self?.serverProcess = nil
                self?.ownsServer = false
                self?.serverReady = false
                completion()
            }
        }
    }

    private func autoOpenIfNeeded() {
        guard !didEvaluateAutoOpen else { return }
        didEvaluateAutoOpen = true
        appendMenuLog("auto-open is \(autoOpenEnabled ? "enabled" : "disabled")")
        guard autoOpenEnabled else { return }
        openBrowser()
    }

    private func openBrowser() {
        guard serverReady else { return }
        appendMenuLog("opening web dashboard at \(baseURL.absoluteString)")
        if !NSWorkspace.shared.open(baseURL) {
            showAlert(
                title: localized("无法打开浏览器", "Could not open the browser"),
                message: localized(
                    "请手动访问 \(baseURL.absoluteString)",
                    "Open \(baseURL.absoluteString) manually."
                )
            )
        }
    }

    // MARK: - Health

    private func checkHealth(completion: @escaping (Bool) -> Void) {
        var request = URLRequest(url: baseURL.appendingPathComponent("healthz"))
        request.timeoutInterval = 1
        request.cachePolicy = .reloadIgnoringLocalCacheData

        URLSession.shared.dataTask(with: request) { _, response, error in
            let healthy = error == nil && (response as? HTTPURLResponse)?.statusCode == 200
            DispatchQueue.main.async {
                completion(healthy)
            }
        }.resume()
    }

    private func refreshRunningModels() {
        var request = URLRequest(url: baseURL.appendingPathComponent("ollama/api/ps"))
        request.timeoutInterval = 2
        request.cachePolicy = .reloadIgnoringLocalCacheData

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            var count: Int?
            if error == nil,
               (response as? HTTPURLResponse)?.statusCode == 200,
               let data,
               let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let models = object["models"] as? [[String: Any]] {
                count = models.count
            }
            DispatchQueue.main.async {
                guard let self, !self.isQuitting else { return }
                self.runningModelCount = count
                self.updateStatus()
            }
        }.resume()
    }

    @objc private func healthTick() {
        guard !isQuitting else { return }
        checkHealth { [weak self] healthy in
            guard let self, !self.isQuitting else { return }
            if healthy {
                if !self.serverReady {
                    self.serverReady = true
                    self.serviceState = .running
                }
                self.updateStatus()
                self.refreshRunningModels()
            } else if self.serverReady {
                self.serverReady = false
                self.runningModelCount = nil
                self.serviceState = .stopped
                self.updateStatus()
            }
        }
    }

    private func updateStatus() {
        guard statusMenuItem != nil else { return }

        let text: String
        switch serviceState {
        case .starting:
            text = localized("本地服务：启动中…", "Local service: starting…")
        case .restarting:
            text = localized("本地服务：重启中…", "Local service: restarting…")
        case .running:
            if let runningModelCount {
                text = localized(
                    "本地服务运行中 · \(runningModelCount) 个模型",
                    "Local service running · \(runningModelCount) model(s)"
                )
            } else {
                text = localized(
                    "本地服务运行中 · 端口 \(port)",
                    "Local service running · port \(port)"
                )
            }
        case .stopped:
            text = localized("本地服务已停止", "Local service stopped")
        }

        statusMenuItem.title = text
        statusItem.button?.toolTip = "\(appName) — \(text)"
    }

    // MARK: - Menu actions

    @objc private func openWeb() {
        guard serverReady else {
            showAlert(
                title: localized("本地服务尚未就绪", "Local service is not ready"),
                message: localized(
                    "请稍等片刻，或从菜单中重启本地服务。",
                    "Wait a moment, or restart the local service from the menu."
                )
            )
            return
        }
        openBrowser()
    }

    @objc private func restartServer() {
        guard ownsServer else {
            showAlert(
                title: localized("当前服务由外部进程启动", "The current service was started externally"),
                message: localized(
                    "3210 端口上的服务不是由菜单栏应用启动的，因此不会被菜单栏停止。请先停止外部服务（例如 npm run dev），再重启。",
                    "The service on port 3210 was not started by this menu bar app, so the app will not stop it. Stop the external service (for example, npm run dev) first."
                )
            )
            return
        }

        appendMenuLog("restart requested")
        isRestarting = true
        serverReady = false
        runningModelCount = nil
        serviceState = .restarting
        updateStatus()

        stopServer { [weak self] in
            guard let self, !self.isQuitting else { return }
            self.launchBundledServer()
        }
    }

    @objc private func openLog() {
        guard let logURL else { return }
        if !NSWorkspace.shared.open(logURL) {
            NSWorkspace.shared.activateFileViewerSelecting([logURL])
        }
    }

    @objc private func copyWebAddress() {
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        pasteboard.setString(baseURL.absoluteString, forType: .string)
    }

    @objc private func toggleAutoOpen() {
        let enabled = !autoOpenEnabled
        UserDefaults.standard.set(enabled, forKey: autoOpenDefaultsKey)
        autoOpenMenuItem.state = enabled ? .on : .off
    }

    @objc private func showAbout() {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.1.0"
        activateApp()
        let alert = NSAlert()
        alert.messageText = appName
        alert.informativeText = localized(
            "菜单栏原型 \(version)\n\n本地 Web：\(baseURL.absoluteString)\n服务由内置 Node 运行时启动；退出应用时停止。\n\n登录项、自动更新和代码签名尚未接入。",
            "Menu bar prototype \(version)\n\nLocal Web: \(baseURL.absoluteString)\nThe service runs on the bundled Node runtime and stops when the app quits.\n\nLogin items, auto-update, and code signing are not wired up yet."
        )
        alert.addButton(withTitle: localized("好", "OK"))
        alert.runModal()
    }

    @objc private func quitApp() {
        appendMenuLog("quit requested")
        isQuitting = true
        NSApp.terminate(nil)
    }

    // MARK: - Logging

    private func prepareLog() {
        let fileManager = FileManager.default
        let library = fileManager.urls(for: .libraryDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library", isDirectory: true)
        let directory = library
            .appendingPathComponent("Logs", isDirectory: true)
            .appendingPathComponent("Ollama Studio Menu", isDirectory: true)

        do {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            let serverURL = directory.appendingPathComponent("server.log")
            let menuURL = directory.appendingPathComponent("menu.log")
            for url in [serverURL, menuURL] where !fileManager.fileExists(atPath: url.path) {
                fileManager.createFile(atPath: url.path, contents: nil)
            }
            logURL = serverURL
            menuLogURL = menuURL
        } catch {
            let serverURL = URL(fileURLWithPath: NSTemporaryDirectory())
                .appendingPathComponent("ollama-studio-server.log")
            let menuURL = URL(fileURLWithPath: NSTemporaryDirectory())
                .appendingPathComponent("ollama-studio-menu.log")
            fileManager.createFile(atPath: serverURL.path, contents: nil)
            fileManager.createFile(atPath: menuURL.path, contents: nil)
            logURL = serverURL
            menuLogURL = menuURL
        }

        logHandle = try? FileHandle(forWritingTo: logURL)
        _ = try? logHandle?.seekToEnd()
    }

    private func appendMenuLog(_ message: String) {
        guard let menuLogURL else { return }
        let timestamp = ISO8601DateFormatter().string(from: Date())
        guard let data = "\(timestamp) \(message)\n".data(using: .utf8) else { return }
        let descriptor = Darwin.open(menuLogURL.path, O_WRONLY | O_APPEND | O_CREAT, 0o644)
        guard descriptor >= 0 else { return }
        defer { Darwin.close(descriptor) }
        data.withUnsafeBytes { buffer in
            _ = Darwin.write(descriptor, buffer.baseAddress, data.count)
        }
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.accessory)
application.run()
