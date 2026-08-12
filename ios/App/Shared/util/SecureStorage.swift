//
//  SecureStorage.swift
//  App
//
//  Created by advplyr on 2025-07-05
//

import Foundation
import Security

// Every entry in this file uses the "ThisDeviceOnly" accessibility variant so refresh tokens
// and CF customHeaders never travel in an encrypted iCloud/iTunes device backup — matching this
// fork's AndroidManifest.xml android:allowBackup="false", a deliberate hardening choice (Android's
// own Keystore-backed encryption key wouldn't survive a restore anyway, but disabling backup
// closes the gap app-wide). The plain "AfterFirstUnlock" variant (without ThisDeviceOnly) WOULD
// be included in encrypted backups and could be restored onto a different device.
class SecureStorage {
    private static let tag = "SecureStorage"
    private static let serviceName = "AudiobookshelfRefreshTokens"
    
    /**
     * Encrypts and stores a refresh token for a specific server connection
     */
    func storeRefreshToken(serverConnectionConfigId: String, refreshToken: String) -> Bool {
        let key = "refresh_token_\(serverConnectionConfigId)"
        
        guard let data = refreshToken.data(using: .utf8) else {
            print("\(Self.tag): Failed to convert refresh token to data")
            return false
        }
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.serviceName,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        
        // First, try to delete any existing item
        SecItemDelete(query as CFDictionary)
        
        // Then add the new item
        let status = SecItemAdd(query as CFDictionary, nil)
        
        if status == errSecSuccess {
            print("\(Self.tag): Successfully stored encrypted refresh token for server: \(serverConnectionConfigId)")
            return true
        } else {
            print("\(Self.tag): Failed to store refresh token for server: \(serverConnectionConfigId), status: \(status)")
            return false
        }
    }
    
    /**
     * Retrieves and decrypts a refresh token for a specific server connection
     */
    func getRefreshToken(serverConnectionConfigId: String) -> String? {
        let key = "refresh_token_\(serverConnectionConfigId)"
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.serviceName,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        if status == errSecSuccess,
           let data = result as? Data,
           let refreshToken = String(data: data, encoding: .utf8) {
            return refreshToken
        } else {
            print("\(Self.tag): Failed to retrieve refresh token for server: \(serverConnectionConfigId), status: \(status)")
            return nil
        }
    }
    
    /**
     * Removes a refresh token for a specific server connection
     */
    func removeRefreshToken(serverConnectionConfigId: String) -> Bool {
        let key = "refresh_token_\(serverConnectionConfigId)"
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.serviceName,
            kSecAttrAccount as String: key
        ]
        
        let status = SecItemDelete(query as CFDictionary)
        
        if status == errSecSuccess || status == errSecItemNotFound {
            print("\(Self.tag): Successfully removed refresh token for server: \(serverConnectionConfigId)")
            return true
        } else {
            print("\(Self.tag): Failed to remove refresh token for server: \(serverConnectionConfigId), status: \(status)")
            return false
        }
    }
    
    // MARK: - Custom Headers

    func storeCustomHeaders(serverConnectionConfigId: String, headers: [String: String]) -> Bool {
        let key = "custom_headers_\(serverConnectionConfigId)"
        guard let data = try? JSONSerialization.data(withJSONObject: headers) else { return false }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.serviceName,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        SecItemDelete(query as CFDictionary)
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }

    func getCustomHeaders(serverConnectionConfigId: String) -> [String: String]? {
        let key = "custom_headers_\(serverConnectionConfigId)"
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.serviceName,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let headers = try? JSONSerialization.jsonObject(with: data) as? [String: String] else {
            return nil
        }
        return headers
    }

    func removeCustomHeaders(serverConnectionConfigId: String) -> Bool {
        let key = "custom_headers_\(serverConnectionConfigId)"
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.serviceName,
            kSecAttrAccount as String: key
        ]
        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    /**
     * Checks if a refresh token exists for a specific server connection
     */
    func hasRefreshToken(serverConnectionConfigId: String) -> Bool {
        let key = "refresh_token_\(serverConnectionConfigId)"
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: Self.serviceName,
            kSecAttrAccount as String: key,
            kSecReturnData as String: false,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        return status == errSecSuccess
    }
} 