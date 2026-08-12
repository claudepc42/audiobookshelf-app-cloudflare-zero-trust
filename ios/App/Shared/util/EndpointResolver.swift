//
//  EndpointResolver.swift
//  App
//
//  Swift port of android/.../device/EndpointResolver.kt — probes a server's LAN
//  address and falls back to its primary address when the LAN address is
//  unreachable or doesn't look like an audiobookshelf server.
//

import Foundation

class EndpointResolver {
    static let shared = EndpointResolver()
    private let probeTimeout: TimeInterval = 0.5

    // followRedirects(false) equivalent — matches EndpointResolver.kt's probeClient exactly.
    // A redirect target is never itself proof of "this is your ABS server"; without this,
    // URLSession would silently follow any redirect and evaluate the WRONG response.
    private let probeSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 0.5
        config.timeoutIntervalForResource = 0.5
        return URLSession(configuration: config, delegate: NoRedirectDelegate(), delegateQueue: nil)
    }()

    // Cached result of the last resolve. Empty string means "not yet resolved".
    private(set) var effectiveAddress: String = ""

    /**
     * Resolves the best available address for the given config and caches it.
     * Probes localAddress first; falls back to address if unreachable, unset,
     * or if whatever answered doesn't look like an audiobookshelf server.
     * Blocks the calling thread — call from a background queue.
     */
    func resolve(config: ServerConnectionConfig?) {
        guard let config = config else {
            effectiveAddress = ""
            return
        }
        let local = config.localAddress ?? ""
        if !local.isEmpty && probe(address: local) {
            AbsLogger.info(message: "EndpointResolver: LAN reachable and verified as ABS — using localAddress: \(local)")
            effectiveAddress = local
        } else {
            AbsLogger.info(message: "EndpointResolver: Using primary address: \(config.address)")
            effectiveAddress = config.address
        }
    }

    /// Marks the current effective address as unhealthy and falls back to the primary address.
    func markUnhealthyAndFallback(config: ServerConnectionConfig?) {
        guard let primary = config?.address else { return }
        if effectiveAddress != primary {
            AbsLogger.info(message: "EndpointResolver: Endpoint \(effectiveAddress) unhealthy — falling back to \(primary)")
            effectiveAddress = primary
        }
    }

    /**
     * Returns true only if the address responds to GET /status within the probe
     * timeout AND the response body is shaped like an audiobookshelf /status
     * response (isInit: Bool, language: String, authMethods: Array).
     *
     * This is a liveness+identity check, not an authentication check — /status is
     * unauthenticated on every ABS server by design, so this deliberately does not
     * send any token or cookie. See EndpointResolver.kt for the full threat-model note.
     */
    private func probe(address: String) -> Bool {
        guard let url = URL(string: "\(address)/status") else { return false }
        var request = URLRequest(url: url, timeoutInterval: probeTimeout)
        request.httpMethod = "GET"

        let sem = DispatchSemaphore(value: 0)
        var looksLikeAbs = false

        probeSession.dataTask(with: request) { data, response, error in
            defer { sem.signal() }
            guard error == nil,
                  let http = response as? HTTPURLResponse,
                  (200...299).contains(http.statusCode),
                  let data = data, !data.isEmpty,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return
            }
            let hasIsInit = (json["isInit"] as? Bool) != nil
            let hasLanguage = (json["language"] as? String) != nil
            let hasAuthMethods = (json["authMethods"] as? [Any]) != nil
            looksLikeAbs = hasIsInit && hasLanguage && hasAuthMethods
        }.resume()

        let waitResult = sem.wait(timeout: .now() + probeTimeout + 0.2)
        return waitResult == .success && looksLikeAbs
    }
}
