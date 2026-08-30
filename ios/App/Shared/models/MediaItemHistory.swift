//
//  MediaItemHistory.swift
//  App
//
//  Swift port of android/.../data/MediaItemHistory.kt — one record per media item
//  (book or podcast episode), holding its own rolling list of playback events.
//  Backs the "History" button on the fullscreen player (SessionHistoryModal.vue).
//

import Foundation
import RealmSwift

class MediaItemHistory: Object, Codable {
    @Persisted(primaryKey: true) var id: String = "" // media item id (mediaItemId, see MediaEventManager)
    @Persisted var mediaDisplayTitle: String = ""
    @Persisted var libraryItemId: String = ""
    @Persisted var episodeId: String?
    @Persisted var isLocal: Bool = false
    @Persisted var serverConnectionConfigId: String?
    @Persisted var serverAddress: String?
    @Persisted var serverUserId: String?
    @Persisted var createdAt: Double = 0
    @Persisted var events = List<MediaItemEvent>()

    private enum CodingKeys: String, CodingKey {
        case id, mediaDisplayTitle, libraryItemId, episodeId, isLocal, serverConnectionConfigId, serverAddress, serverUserId, createdAt, events
    }

    override init() {
        super.init()
    }

    required init(from decoder: Decoder) throws {
        super.init()
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        mediaDisplayTitle = try values.decode(String.self, forKey: .mediaDisplayTitle)
        libraryItemId = try values.decode(String.self, forKey: .libraryItemId)
        episodeId = try? values.decode(String.self, forKey: .episodeId)
        isLocal = try values.decode(Bool.self, forKey: .isLocal)
        serverConnectionConfigId = try? values.decode(String.self, forKey: .serverConnectionConfigId)
        serverAddress = try? values.decode(String.self, forKey: .serverAddress)
        serverUserId = try? values.decode(String.self, forKey: .serverUserId)
        createdAt = try values.decode(Double.self, forKey: .createdAt)
        let decodedEvents = try values.decode([MediaItemEvent].self, forKey: .events)
        events = List<MediaItemEvent>()
        events.append(objectsIn: decodedEvents)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(mediaDisplayTitle, forKey: .mediaDisplayTitle)
        try container.encode(libraryItemId, forKey: .libraryItemId)
        try container.encode(episodeId, forKey: .episodeId)
        try container.encode(isLocal, forKey: .isLocal)
        try container.encode(serverConnectionConfigId, forKey: .serverConnectionConfigId)
        try container.encode(serverAddress, forKey: .serverAddress)
        try container.encode(serverUserId, forKey: .serverUserId)
        try container.encode(createdAt, forKey: .createdAt)
        try container.encode(Array(events), forKey: .events)
    }
}
