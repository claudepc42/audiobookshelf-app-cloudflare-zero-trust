package com.audiobookshelf.app.managers

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import com.audiobookshelf.app.plugins.AbsLogger
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import java.security.KeyStore
import java.util.concurrent.ConcurrentHashMap
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureStorage(private val context: Context) {
    companion object {
        private const val TAG = "SecureStorage"
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val KEY_ALIAS = "AudiobookshelfRefreshTokens"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val IV_LENGTH = 12
        private const val TAG_LENGTH = 128

        // What is currently stored for each server's custom headers, shared by every SecureStorage
        // instance. Encrypting uses a fresh random IV each time, so without this every device-data
        // save rewrote every server's headers even when nothing had changed, and every read decrypted them.
        private val customHeadersCache = ConcurrentHashMap<String, Map<String, String>>()
    }

    private val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply {
        load(null)
    }

    private val jacksonMapper = jacksonObjectMapper()

    /**
     * Encrypts and stores a refresh token for a specific server connection
     */
    fun storeRefreshToken(serverConnectionId: String, refreshToken: String): Boolean {
        return try {
            val key = getOrCreateKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key)

            val encryptedBytes = cipher.doFinal(refreshToken.toByteArray(Charsets.UTF_8))
            val combined = cipher.iv + encryptedBytes

            val encoded = Base64.encodeToString(combined, Base64.DEFAULT)

            val sharedPrefs = context.getSharedPreferences("SecureStorage", Context.MODE_PRIVATE)
            sharedPrefs.edit().putString("refresh_token_$serverConnectionId", encoded).apply()

            Log.d(TAG, "Successfully stored encrypted refresh token for server: $serverConnectionId")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to store refresh token for server: $serverConnectionId", e)
            false
        }
    }

    /**
     * Retrieves and decrypts a refresh token for a specific server connection
     */
    fun getRefreshToken(serverConnectionId: String): String? {
        return try {
            val sharedPrefs = context.getSharedPreferences("SecureStorage", Context.MODE_PRIVATE)
            val encoded = sharedPrefs.getString("refresh_token_$serverConnectionId", null) ?: return null

            val combined = Base64.decode(encoded, Base64.DEFAULT)
            val iv = combined.copyOfRange(0, IV_LENGTH)
            val encryptedBytes = combined.copyOfRange(IV_LENGTH, combined.size)

            val key = getOrCreateKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val spec = GCMParameterSpec(TAG_LENGTH, iv)
            cipher.init(Cipher.DECRYPT_MODE, key, spec)

            val decryptedBytes = cipher.doFinal(encryptedBytes)
            String(decryptedBytes, Charsets.UTF_8)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to retrieve refresh token for server: $serverConnectionId", e)
            AbsLogger.error(TAG, "getRefreshToken: Decrypt/read failed for server $serverConnectionId (${e.javaClass.simpleName}: ${e.message})")
            null
        }
    }

    /**
     * Removes a refresh token for a specific server connection
     */
    fun removeRefreshToken(serverConnectionId: String): Boolean {
        return try {
            val sharedPrefs = context.getSharedPreferences("SecureStorage", Context.MODE_PRIVATE)
            sharedPrefs.edit().remove("refresh_token_$serverConnectionId").apply()
            Log.d(TAG, "Successfully removed refresh token for server: $serverConnectionId")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to remove refresh token for server: $serverConnectionId", e)
            false
        }
    }

    /**
     * Checks if a refresh token exists for a specific server connection
     */
    fun hasRefreshToken(serverConnectionId: String): Boolean {
        val sharedPrefs = context.getSharedPreferences("SecureStorage", Context.MODE_PRIVATE)
        return sharedPrefs.contains("refresh_token_$serverConnectionId")
    }

    /**
     * Encrypts and stores the custom headers (CF Zero Trust session cookie and/or manually
     * entered service token headers) for a specific server connection. Passing a null or empty
     * map removes any previously stored value.
     */
    fun storeCustomHeaders(serverConnectionId: String, customHeaders: Map<String, String>?): Boolean {
        if (customHeaders.isNullOrEmpty()) {
            return removeCustomHeaders(serverConnectionId)
        }
        if (customHeadersCache[serverConnectionId] == customHeaders) return true
        return try {
            val json = jacksonMapper.writeValueAsString(customHeaders)
            val key = getOrCreateKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key)

            val encryptedBytes = cipher.doFinal(json.toByteArray(Charsets.UTF_8))
            val combined = cipher.iv + encryptedBytes

            val encoded = Base64.encodeToString(combined, Base64.DEFAULT)

            val sharedPrefs = context.getSharedPreferences("SecureStorage", Context.MODE_PRIVATE)
            sharedPrefs.edit().putString("custom_headers_$serverConnectionId", encoded).apply()
            customHeadersCache[serverConnectionId] = customHeaders.toMap()

            Log.d(TAG, "Successfully stored encrypted custom headers for server: $serverConnectionId")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to store custom headers for server: $serverConnectionId", e)
            false
        }
    }

    /**
     * Retrieves and decrypts the custom headers for a specific server connection
     */
    fun getCustomHeaders(serverConnectionId: String): Map<String, String>? {
        customHeadersCache[serverConnectionId]?.let { return it }
        return try {
            val sharedPrefs = context.getSharedPreferences("SecureStorage", Context.MODE_PRIVATE)
            val encoded = sharedPrefs.getString("custom_headers_$serverConnectionId", null) ?: return null

            val combined = Base64.decode(encoded, Base64.DEFAULT)
            val iv = combined.copyOfRange(0, IV_LENGTH)
            val encryptedBytes = combined.copyOfRange(IV_LENGTH, combined.size)

            val key = getOrCreateKey()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val spec = GCMParameterSpec(TAG_LENGTH, iv)
            cipher.init(Cipher.DECRYPT_MODE, key, spec)

            val decryptedBytes = cipher.doFinal(encryptedBytes)
            val json = String(decryptedBytes, Charsets.UTF_8)
            jacksonMapper.readValue<Map<String, String>>(json).also { customHeadersCache[serverConnectionId] = it }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to retrieve custom headers for server: $serverConnectionId", e)
            // Otherwise a Keystore failure silently drops the CF cookie with no trace in the in-app logs
            AbsLogger.error(TAG, "getCustomHeaders: Decrypt/read failed for server $serverConnectionId (${e.javaClass.simpleName}: ${e.message})")
            null
        }
    }

    /**
     * Removes the custom headers for a specific server connection
     */
    fun removeCustomHeaders(serverConnectionId: String): Boolean {
        customHeadersCache.remove(serverConnectionId)
        return try {
            val sharedPrefs = context.getSharedPreferences("SecureStorage", Context.MODE_PRIVATE)
            sharedPrefs.edit().remove("custom_headers_$serverConnectionId").apply()
            Log.d(TAG, "Successfully removed custom headers for server: $serverConnectionId")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to remove custom headers for server: $serverConnectionId", e)
            false
        }
    }

    private fun getOrCreateKey(): SecretKey {
        return if (keyStore.containsAlias(KEY_ALIAS)) {
            keyStore.getKey(KEY_ALIAS, null) as SecretKey
        } else {
            createKey()
        }
    }

    private fun createKey(): SecretKey {
        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        val keyGenSpec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setUserAuthenticationRequired(false)
            .setRandomizedEncryptionRequired(true)
            .build()

        keyGenerator.init(keyGenSpec)
        return keyGenerator.generateKey()
    }
}
