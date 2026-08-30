//
//  MediaItemEvent.swift
//  App
//
//  Swift port of android/.../data/MediaItemEvent.kt — a single history entry
//  (Play/Pause/Stop/Seek/Save/Finished) nested inside a MediaItemHistory record.
//

import Foundation
import RealmSwift

class MediaItemEvent: EmbeddedObject, Codable {
    @Persisted var name: String // e.g. Play/Pause/Stop/Seek/Save
    @Persisted var type: String // Playback/Info
    @Persisted var eventDescription: String?
    @Persisted var currentTime: Double?
    @Persisted var serverSyncAttempted: Bool?
    @Persisted var serverSyncSuccess: Bool?
    @Persisted var serverSyncMessage: String?
    @Persisted var timestamp: Double // milliseconds since epoch, matching Android's System.currentTimeMillis()

    private enum CodingKeys: String, CodingKey {
        case name, type, currentTime, serverSyncAttempted, serverSyncSuccess, serverSyncMessage, timestamp
        case eventDescription = "description"
    }

    convenience init(name: String, type: String, description: String? = nil, currentTime: Double? = nil, serverSyncAttempted: Bool? = nil, serverSyncSuccess: Bool? = nil, serverSyncMessage: String? = nil) {
        self.init()
        self.name = name
        self.type = type
        self.eventDescription = description
        self.currentTime = currentTime
        self.serverSyncAttempted = serverSyncAttempted
        self.serverSyncSuccess = serverSyncSuccess
        self.serverSyncMessage = serverSyncMessage
        self.timestamp = Date().timeIntervalSince1970 * 1000
    }

    override init() {
        super.init()
    }

    required init(from decoder: Decoder) throws {
        super.init()
        let values = try decoder.container(keyedBy: CodingKeys.self)
        name = try values.decode(String.self, forKey: .name)
        type = try values.decode(String.self, forKey: .type)
        eventDescription = try? values.decode(String.self, forKey: .eventDescription)
        currentTime = try? values.decode(Double.self, forKey: .currentTime)
        serverSyncAttempted = try? values.decode(Bool.self, forKey: .serverSyncAttempted)
        serverSyncSuccess = try? values.decode(Bool.self, forKey: .serverSyncSuccess)
        serverSyncMessage = try? values.decode(String.self, forKey: .serverSyncMessage)
        timestamp = try values.decode(Double.self, forKey: .timestamp)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(type, forKey: .type)
        try container.encode(eventDescription, forKey: .eventDescription)
        try container.encode(currentTime, forKey: .currentTime)
        try container.encode(serverSyncAttempted, forKey: .serverSyncAttempted)
        try container.encode(serverSyncSuccess, forKey: .serverSyncSuccess)
        try container.encode(serverSyncMessage, forKey: .serverSyncMessage)
        try container.encode(timestamp, forKey: .timestamp)
    }
}
