//
//  Store.swift
//  App
//
//  Created by Rasmus Krämer on 11.04.22.
//

import Foundation
import RealmSwift

class Store {
    // In-memory custom headers for the active server connection (CF cookies, service tokens, etc.).
    // Not persisted in Realm — loaded from Keychain by AbsDatabase on login/init, cleared on logout.
    public static var customHeaders: [String: String]? = nil

    /// The address to actually make requests against — the resolved LAN address when
    /// reachable and verified as ABS, otherwise the server's primary address. Mirrors
    /// DeviceManager.serverAddress on Android (EndpointResolver.effectiveAddress with
    /// a fallback to serverConfig.address while nothing has been resolved yet).
    public static var effectiveAddress: String {
        let resolved = EndpointResolver.shared.effectiveAddress
        return resolved.isEmpty ? (serverConfig?.address ?? "") : resolved
    }

    public static var serverConfig: ServerConnectionConfig? {
        get {
            do {
                // Fetch each time, as holding onto a live or frozen realm object is bad
                let index = Database.shared.getLastActiveConfigIndex()
                let realm = try Realm()
                return realm.objects(ServerConnectionConfig.self).first(where: { $0.index == index })
            } catch {
                debugPrint(error)
                return nil
            }
        }
        set(updated) {
            if updated != nil {
                Database.shared.setServerConnectionConfig(config: updated!)
            } else {
                Database.shared.setLastActiveConfigIndexToNil()
            }
        }
    }
    
    /**
     * Check if the currently connected server version is >= compareVersion
     * Abs server only uses major.minor.patch
     * Note: Version is returned in Abs auth payloads starting v2.6.0
     * Note: Version is saved with the server connection config starting after v0.9.81
     *
     * @example
     * serverVersion=2.25.1
     * isServerVersionGreaterThanOrEqualTo("2.26.0") = false
     *
     * serverVersion=2.26.1
     * isServerVersionGreaterThanOrEqualTo("2.26.0") = true
     */
    public static func isServerVersionGreaterThanOrEqualTo(_ compareVersion: String) -> Bool {
        guard let serverConfig = serverConfig, !serverConfig.version.isEmpty else {
            return false
        }
        
        if compareVersion.isEmpty {
            return true
        }
        
        let serverVersionParts = serverConfig.version.split(separator: ".").compactMap { Int($0) }
        let compareVersionParts = compareVersion.split(separator: ".").compactMap { Int($0) }
        
        // Compare major, minor, and patch components
        let maxLength = max(serverVersionParts.count, compareVersionParts.count)
        
        for i in 0..<maxLength {
            let serverVersionComponent = i < serverVersionParts.count ? serverVersionParts[i] : 0
            let compareVersionComponent = i < compareVersionParts.count ? compareVersionParts[i] : 0
            
            if serverVersionComponent < compareVersionComponent {
                return false // Server version is less than compareVersion
            } else if serverVersionComponent > compareVersionComponent {
                return true // Server version is greater than compareVersion
            }
        }
        
        return true // versions are equal in major, minor, and patch
    }
}
