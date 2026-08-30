//
//  NanoHiveWidgetView.swift
//  NanoHiveWidget
//
//  SwiftUI equivalent of nanohive_media_player_widget.xml — same content
//  (cover, title/author, transport row, progress + time), reimplemented in
//  WidgetKit's declarative model instead of RemoteViews.
//
//  KNOWN PARITY GAP (verify once building on-device): individual per-button
//  Link tap targets inside a widget are only reliably independent of each
//  other on iOS 17+; on iOS 14-16 WidgetKit historically only guaranteed a
//  single whole-widget tap URL. .widgetURL() below covers the safe fallback
//  (tap anywhere opens the player); the per-button Links are the best-effort
//  granular behavior for iOS 17+. This needs confirming on a real device —
//  see the setup checklist.
//

import WidgetKit
import SwiftUI

struct NanoHiveWidgetView: View {
    let snapshot: WidgetSnapshot

    private var accent: Color { Color(hex: snapshot.accentColorHex) }
    private var canvas: Color { Color(hex: snapshot.canvasColorHex) }

    var body: some View {
        HStack(spacing: 12) {
            coverArt

            VStack(alignment: .leading, spacing: 6) {
                // Exact NH theme values from nanohive_media_player_widget.xml — the widget's
                // canvas is always dark regardless of system light/dark mode, so these are
                // deliberately hardcoded rather than .primary/.secondary (which would flip to
                // near-black text in system light mode and be unreadable against the canvas).
                Text(snapshot.title)
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(1)
                    .foregroundColor(Color(hex: "#f4eee2"))

                Text(snapshot.author)
                    .font(.system(size: 11))
                    .lineLimit(1)
                    .foregroundColor(Color(hex: "#f4eee2").opacity(0.75))

                Spacer(minLength: 4)

                if !snapshot.isAppClosed {
                    transportRow
                    progressRow
                }
            }
        }
        .padding(12)
        .background(canvas.opacity(snapshot.opacity))
        .widgetURL(URL(string: "audiobookshelf://widget-action?type=open"))
    }

    private var coverArt: some View {
        Group {
            if let urlString = snapshot.coverUrlString, let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().aspectRatio(contentMode: .fill)
                    default:
                        placeholderCover
                    }
                }
            } else {
                placeholderCover
            }
        }
        .frame(width: 76, height: 76)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var placeholderCover: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(Color.gray.opacity(0.25))
            .overlay(Image(systemName: "book.closed").foregroundColor(.gray))
    }

    private var transportRow: some View {
        HStack(spacing: 18) {
            Link(destination: URL(string: "audiobookshelf://widget-action?type=rewind")!) {
                Image(systemName: "gobackward.10").foregroundColor(accent)
            }
            Link(destination: URL(string: "audiobookshelf://widget-action?type=play-pause")!) {
                Image(systemName: snapshot.isPlaying ? "pause.fill" : "play.fill").foregroundColor(accent)
            }
            Link(destination: URL(string: "audiobookshelf://widget-action?type=fast-forward")!) {
                Image(systemName: "goforward.30").foregroundColor(accent)
            }
            Spacer()
            Link(destination: URL(string: "audiobookshelf://widget-action?type=bookmark")!) {
                Image(systemName: "bookmark").foregroundColor(accent)
            }
            Link(destination: URL(string: "audiobookshelf://widget-action?type=sleep-timer")!) {
                Image(systemName: "moon.zzz").foregroundColor(accent)
            }
        }
        .font(.system(size: 15))
    }

    private var progressRow: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(WidgetSnapshot.formatTimestamp(snapshot.currentTime))
                Spacer()
                Text("-" + WidgetSnapshot.formatTimestamp(max(0, snapshot.duration - snapshot.currentTime)))
            }
            // Matches widgetCurrentTime/widgetTimeRemaining exactly: #9a9085, monospace.
            .font(.system(size: 9, design: .monospaced))
            .foregroundColor(Color(hex: "#9a9085"))

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.15))
                    Capsule().fill(accent).frame(width: geo.size.width * snapshot.progress)
                }
            }
            .frame(height: 3)
        }
    }
}

private extension Color {
    init(hex: String) {
        var hexString = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        hexString = hexString.replacingOccurrences(of: "#", with: "")
        var rgb: UInt64 = 0
        Scanner(string: hexString).scanHexInt64(&rgb)
        let r = Double((rgb & 0xFF0000) >> 16) / 255
        let g = Double((rgb & 0x00FF00) >> 8) / 255
        let b = Double(rgb & 0x0000FF) / 255
        self.init(red: r, green: g, blue: b)
    }
}
