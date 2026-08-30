//
//  AbsCfZeroTrust.swift
//  App
//

import Foundation
import UIKit
import WebKit
import Capacitor

@objc(AbsCfZeroTrust)
public class AbsCfZeroTrust: CAPPlugin, CAPBridgedPlugin {
    public var identifier = "AbsCfZeroTrustPlugin"
    public var jsName = "AbsCfZeroTrust"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "probeCfChallenge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openCfWebView", returnType: CAPPluginReturnPromise)
    ]

    static var instance: AbsCfZeroTrust?

    public override func load() {
        AbsCfZeroTrust.instance = self
    }

    static func notifyCfSessionExpired() {
        instance?.notifyListeners("cfSessionExpired", data: [:], retainUntilConsumed: true)
    }

    @objc func probeCfChallenge(_ call: CAPPluginCall) {
        guard let serverAddress = call.getString("serverAddress") else {
            call.reject("serverAddress is required")
            return
        }
        let existingCookies = call.getString("cookies") ?? ""

        DispatchQueue.global(qos: .background).async {
            let isCfProtected = Self.doProbeCfChallenge(serverAddress: serverAddress)
            let cookiesValid = isCfProtected && !existingCookies.isEmpty && Self.checkCookiesValid(serverAddress: serverAddress, cookies: existingCookies)
            call.resolve(["isCfProtected": isCfProtected, "cookiesValid": cookiesValid])
        }
    }

    // HEAD request to several paths with redirect-following disabled.
    // Returns true if any path redirects to cloudflareaccess.com.
    static func doProbeCfChallenge(serverAddress: String) -> Bool {
        for path in ["/hls/", "/s/", "/status"] {
            guard let url = URL(string: "\(serverAddress)\(path)") else { continue }
            var request = URLRequest(url: url, timeoutInterval: 6)
            request.httpMethod = "HEAD"
            let sem = DispatchSemaphore(value: 0)
            var isCf = false
            let session = URLSession(configuration: .ephemeral, delegate: NoRedirectDelegate(), delegateQueue: nil)
            session.dataTask(with: request) { _, response, _ in
                if let http = response as? HTTPURLResponse,
                   (300...399).contains(http.statusCode),
                   let location = http.value(forHTTPHeaderField: "Location"),
                   let host = URL(string: location)?.host {
                    isCf = host == "cloudflareaccess.com" || host.hasSuffix(".cloudflareaccess.com")
                }
                sem.signal()
            }.resume()
            sem.wait()
            if isCf { return true }
        }
        return false
    }

    // Probes /hls/ with the existing cookies. Returns true if the cookies are still valid
    // (ABS responded) or false if CF redirected (cookies stale).
    private static func checkCookiesValid(serverAddress: String, cookies: String) -> Bool {
        guard let url = URL(string: "\(serverAddress)/hls/") else { return false }
        var request = URLRequest(url: url, timeoutInterval: 6)
        request.httpMethod = "HEAD"
        request.setValue(cookies, forHTTPHeaderField: "Cookie")
        // Without this, URLSession's automatic cookie handling can silently override
        // or ignore a manually-set Cookie header — this probe would otherwise send
        // whatever's in the session's own cookie jar (nothing, for a fresh ephemeral
        // session) instead of the specific cookies being validated.
        request.httpShouldHandleCookies = false
        let sem = DispatchSemaphore(value: 0)
        var valid = false
        let session = URLSession(configuration: .ephemeral, delegate: NoRedirectDelegate(), delegateQueue: nil)
        session.dataTask(with: request) { _, response, error in
            // Mirrors Android's try/catch { false }: a network-level failure (no HTTP response
            // at all — timeout, DNS failure, connection refused) must fail CLOSED (treated as
            // "not valid", triggering a fresh WebView login) not fail OPEN. Only an actual HTTP
            // response that isn't a CF redirect counts as confirmed-valid.
            if let http = response as? HTTPURLResponse {
                if (300...399).contains(http.statusCode),
                   let location = http.value(forHTTPHeaderField: "Location"),
                   let host = URL(string: location)?.host {
                    let isCfRedirect = host == "cloudflareaccess.com" || host.hasSuffix(".cloudflareaccess.com")
                    valid = !isCfRedirect
                } else {
                    valid = true
                }
            } else {
                valid = false
            }
            sem.signal()
        }.resume()
        sem.wait()
        return valid
    }

    @objc func openCfWebView(_ call: CAPPluginCall) {
        guard let serverAddress = call.getString("serverAddress") else {
            call.reject("serverAddress is required")
            return
        }
        guard let serverUrl = URL(string: serverAddress),
              let serverHost = serverUrl.host, !serverHost.isEmpty else {
            call.reject("Invalid serverAddress")
            return
        }

        DispatchQueue.main.async {
            let vc = CfWebViewController(serverAddress: serverAddress, serverHost: serverHost, call: call)
            self.bridge?.viewController?.present(vc, animated: true)
        }
    }
}

// URLSessionTaskDelegate that stops redirects so we can read the Location header.
// Not private — EndpointResolver.swift reuses this for its own no-redirect LAN probe.
class NoRedirectDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

// Full-screen view controller that hosts a WKWebView for CF authentication.
class CfWebViewController: UIViewController, WKNavigationDelegate {
    private let serverAddress: String
    private let serverHost: String
    private let call: CAPPluginCall
    private var resolved = false
    private var webView: WKWebView!
    private var urlLabel: UILabel!

    init(serverAddress: String, serverHost: String, call: CAPPluginCall) {
        self.serverAddress = serverAddress
        self.serverHost = serverHost
        self.call = call
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let headerBar = UIView()
        headerBar.backgroundColor = UIColor(white: 0.07, alpha: 1)
        headerBar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(headerBar)

        urlLabel = UILabel()
        urlLabel.text = serverHost
        urlLabel.textColor = UIColor(white: 0.67, alpha: 1)
        urlLabel.font = UIFont.systemFont(ofSize: 12)
        urlLabel.translatesAutoresizingMaskIntoConstraints = false
        headerBar.addSubview(urlLabel)

        let cancelButton = UIButton(type: .system)
        cancelButton.setTitle("Cancel", for: .normal)
        cancelButton.titleLabel?.font = UIFont.systemFont(ofSize: 12)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        headerBar.addSubview(cancelButton)

        let webConfig = WKWebViewConfiguration()
        webConfig.websiteDataStore = WKWebsiteDataStore.default()
        webView = WKWebView(frame: .zero, configuration: webConfig)
        webView.navigationDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            headerBar.topAnchor.constraint(equalTo: safe.topAnchor),
            headerBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            headerBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            headerBar.heightAnchor.constraint(equalToConstant: 44),

            urlLabel.leadingAnchor.constraint(equalTo: headerBar.leadingAnchor, constant: 16),
            urlLabel.centerYAnchor.constraint(equalTo: headerBar.centerYAnchor),
            urlLabel.trailingAnchor.constraint(lessThanOrEqualTo: cancelButton.leadingAnchor, constant: -8),

            cancelButton.trailingAnchor.constraint(equalTo: headerBar.trailingAnchor, constant: -16),
            cancelButton.centerYAnchor.constraint(equalTo: headerBar.centerYAnchor),

            webView.topAnchor.constraint(equalTo: headerBar.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        if let url = URL(string: serverAddress) {
            webView.load(URLRequest(url: url))
        }
    }

    @objc private func cancelTapped() {
        dismiss(animated: true) { [weak self] in
            guard let self = self, !self.resolved else { return }
            self.call.reject("cancelled")
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !resolved, let currentUrl = webView.url else { return }
        let currentHost = currentUrl.host ?? ""
        guard currentHost == serverHost || currentHost.hasSuffix(".\(serverHost)") else { return }

        urlLabel?.text = currentHost

        webView.configuration.websiteDataStore.httpCookieStore.getAllCookies { [weak self] cookies in
            guard let self = self, !self.resolved else { return }

            // Cookie.domain matching follows standard cookie-scoping rules: a cookie set
            // with a leading-dot domain (e.g. ".example.com") applies to that host and all
            // subdomains. Strip the leading dot before comparing so a binding cookie set on
            // a parent domain is still picked up for an exact-host match on serverHost.
            let relevantCookies = cookies.filter { cookie in
                let cookieDomain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
                return self.serverHost == cookieDomain || self.serverHost.hasSuffix("." + cookieDomain)
            }
            guard relevantCookies.contains(where: { $0.name == "CF_Authorization" }) else { return }

            let cookieHeader = relevantCookies.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")
            self.resolved = true
            DispatchQueue.main.async {
                self.dismiss(animated: true) {
                    self.call.resolve(["cookieHeader": cookieHeader])
                }
            }
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        if let host = webView.url?.host {
            urlLabel?.text = host
        }
    }
}
