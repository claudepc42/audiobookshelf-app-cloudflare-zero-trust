//
//  NowPlaying.swift
//  App
//
//  Created by Rasmus Krämer on 22.03.22.
//

import Foundation
import MediaPlayer

struct NowPlayingMetadata {
    var id: String
    var itemId: String
    var title: String
    var author: String?
    var series: String?
    var isLocal: Bool
    // Frozen at session-creation time, same as PlaybackSession.serverAddress on Android
    // (PlaybackSession.kt's cover URI also uses the session's own serverAddress, not a live
    // lookup) — falls back to the live effective address if the session didn't carry one.
    var serverAddress: String? = nil

    var coverUrl: URL? {
        if self.isLocal {
            guard let item = Database.shared.getLocalLibraryItem(byServerLibraryItemId: self.itemId) else { return nil }
            return item.coverUrl
        } else {
            guard let config = Store.serverConfig else { return nil }
            let address = self.serverAddress ?? Store.effectiveAddress

            // As of v2.17.0 token is not needed with cover image requests
            let coverUrlString: String
            if Store.isServerVersionGreaterThanOrEqualTo("2.17.0") {
                coverUrlString = "\(address)/api/items/\(itemId)/cover"
            } else {
                coverUrlString = "\(address)/api/items/\(itemId)/cover?token=\(config.token)"
            }

            return URL(string: coverUrlString)
        }
    }
}

class NowPlayingInfo {
    static var shared = {
        return NowPlayingInfo()
    }()
    
    private var nowPlayingInfo: [String: Any]

    // Blur cache — avoids re-blurring the same cover on every metadata refresh
    // (e.g. chapter changes within the same track). Mirrors
    // AbMediaDescriptionAdapter's currentBitmap/currentBlurredBitmap cache on Android.
    private var lastCoverUrl: URL?
    private var lastBlurredImage: UIImage?

    private init() {
        self.nowPlayingInfo = [:]
    }

    public func setSessionMetadata(metadata: NowPlayingMetadata) {
        setMetadata(artwork: nil, metadata: metadata)
        guard let url = metadata.coverUrl else { return }

        if url == lastCoverUrl, let cached = lastBlurredImage {
            let artwork = MPMediaItemArtwork(boundsSize: cached.size, requestHandler: { _ -> UIImage in cached })
            self.setMetadata(artwork: artwork, metadata: metadata)
            return
        }

        // For local images, "downloading" is occurring off disk, hence this code path works as expected
        ApiClient.getData(from: url) { [self] image in
            guard let downloadedImage = image else {
                // KNOWN MINOR GAP vs Android: AbMediaDescriptionAdapter falls back to a branded
                // app-icon bitmap (unblurred) on fetch failure, so Now Playing always shows
                // *something*. Reliably loading the app icon programmatically on iOS needs care
                // (AppIcon.appiconset isn't a plain named image) and wasn't worth risking
                // untested here — on failure this just leaves title/author with no artwork,
                // which is a readable but less polished degradation than Android's.
                return
            }
            let blurred = Self.blurImage(downloadedImage)
            self.lastCoverUrl = url
            self.lastBlurredImage = blurred

            let artwork = MPMediaItemArtwork.init(boundsSize: blurred.size, requestHandler: { _ -> UIImage in
                return blurred
            })

            self.setMetadata(artwork: artwork, metadata: metadata)
        }
    }

    // Same scale-down/scale-up technique as Android's AbMediaDescriptionAdapter.blurBitmap:
    // downscale by a fixed factor (bilinear filtering smooths detail), then upscale back
    // to the original size — cheap box-blur approximation with no external dependencies.
    private static func blurImage(_ image: UIImage) -> UIImage {
        let scaleFactor: CGFloat = 8
        let smallSize = CGSize(
            width: max(1, image.size.width / scaleFactor),
            height: max(1, image.size.height / scaleFactor)
        )

        UIGraphicsBeginImageContextWithOptions(smallSize, false, 1)
        image.draw(in: CGRect(origin: .zero, size: smallSize))
        let small = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
        guard let small = small else { return image }

        UIGraphicsBeginImageContextWithOptions(image.size, false, image.scale)
        small.draw(in: CGRect(origin: .zero, size: image.size))
        let blurred = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()

        return blurred ?? image
    }
    public func update(duration: Double, currentTime: Double, rate: Float, defaultRate: Float, chapterName: String? = nil, chapterNumber: Int? = nil, chapterCount: Int? = nil) {
        // Update on the main to prevent access collisions
        DispatchQueue.main.async { [weak self] in
            if let self = self {
                self.nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = duration
                self.nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
                self.nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = rate
                self.nowPlayingInfo[MPNowPlayingInfoPropertyDefaultPlaybackRate] = defaultRate
                    
                
                if let chapterName = chapterName, let chapterNumber = chapterNumber, let chapterCount = chapterCount {
                    self.nowPlayingInfo[MPMediaItemPropertyTitle] = chapterName
                    self.nowPlayingInfo[MPNowPlayingInfoPropertyChapterNumber] = chapterNumber
                    self.nowPlayingInfo[MPNowPlayingInfoPropertyChapterCount] = chapterCount
                } else {
                    // Set the title back to the book title
                    self.nowPlayingInfo[MPMediaItemPropertyTitle] = self.nowPlayingInfo[MPMediaItemPropertyAlbumTitle]
                    self.nowPlayingInfo[MPNowPlayingInfoPropertyChapterNumber] = nil
                    self.nowPlayingInfo[MPNowPlayingInfoPropertyChapterCount] = nil
                }
                
                MPNowPlayingInfoCenter.default().nowPlayingInfo = self.nowPlayingInfo
            }
        }
    }
    
    public func reset() {
        nowPlayingInfo = [:]
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
    
    private func setMetadata(artwork: MPMediaItemArtwork?, metadata: NowPlayingMetadata?) {
        if metadata == nil {
            return
        }
        
        if artwork != nil {
            nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
        } else if shouldFetchCover(id: metadata!.id) {
            nowPlayingInfo[MPMediaItemPropertyArtwork] = nil
        }
        
        nowPlayingInfo[MPNowPlayingInfoPropertyExternalContentIdentifier] = metadata!.id
        nowPlayingInfo[MPNowPlayingInfoPropertyIsLiveStream] = false
        nowPlayingInfo[MPNowPlayingInfoPropertyMediaType] = "hls"
        
        nowPlayingInfo[MPMediaItemPropertyTitle] = metadata!.title
        nowPlayingInfo[MPMediaItemPropertyArtist] = metadata!.author ?? "unknown"
        nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = metadata!.title
    }
    
    private func shouldFetchCover(id: String) -> Bool {
        nowPlayingInfo[MPNowPlayingInfoPropertyExternalContentIdentifier] as? String != id || nowPlayingInfo[MPMediaItemPropertyArtwork] == nil
    }
}
