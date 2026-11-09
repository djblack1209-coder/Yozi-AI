import Observation
import SwiftUI
import UIKit
import WatchConnectivity

private struct Glance: Equatable {
    let done: Int
    let total: Int
    let due: Int
    let reminder: Date?
    let reminderKind: String?

    init?(_ context: [String: Any]) {
        guard context["contract"] as? String == "glance-v1",
              context["available"] as? Bool == true,
              let done = context["done"] as? Int, done >= 0,
              let total = context["total"] as? Int, total >= done,
              let due = context["due"] as? Int, due >= 0 else { return nil }
        self.done = done
        self.total = total
        self.due = due
        if let milliseconds = context["nextAt"] as? Double, milliseconds.isFinite,
           let kind = context["nextKind"] as? String, ["study", "review", "recap"].contains(kind) {
            reminder = Date(timeIntervalSince1970: milliseconds / 1000)
            reminderKind = kind
        } else {
            reminder = nil
            reminderKind = nil
        }
    }
}

@MainActor
@Observable
private final class PhoneGlance: NSObject, WCSessionDelegate {
    private(set) var current: Glance?

    func start() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    nonisolated func session(
        _ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?
    ) {
        receive(session.receivedApplicationContext)
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        receive(context)
    }

    private nonisolated func receive(_ context: [String: Any]) {
        let incoming = Glance(context)
        Task { @MainActor in current = incoming }
    }
}

private struct TodayView: View {
    let glance: Glance
    private let ice = Color(red: 0.68, green: 0.86, blue: 0.98)
    private let lilac = Color(red: 0.82, green: 0.76, blue: 0.99)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 7) {
                progressCard
                detail("待复习", value: "\(glance.due) 项", symbol: "books.vertical", tint: ice)
                if let date = glance.reminder, date > .now {
                    let time = date.formatted(
                        .dateTime.month().day().hour().minute().locale(Locale(identifier: "zh_CN"))
                    )
                    detail(reminderLabel, value: time, symbol: "bell", tint: lilac)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 5)
        }
    }

    private var progressCard: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("今日学习")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            if glance.total > 0 {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(glance.done)")
                        .font(.system(.largeTitle, design: .rounded, weight: .bold))
                        .foregroundStyle(ice)
                    Text("/ \(glance.total) 项")
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(.white.opacity(0.82))
                }
                .lineLimit(1)
                .minimumScaleFactor(0.65)
                .monospacedDigit()
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("已完成 \(glance.done) 项，共 \(glance.total) 项")
                ProgressView(value: Double(glance.done), total: Double(glance.total))
                    .tint(ice)
                    .accessibilityHidden(true)
            } else {
                Text("暂无今日计划")
                    .font(.footnote)
                    .foregroundStyle(ice)
            }
        }
        .padding(11)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(alignment: .trailing) {
            Image(systemName: "book.pages")
                .font(.system(size: 66, weight: .light))
                .rotationEffect(.degrees(-18))
                .foregroundStyle(ice.opacity(0.16))
                .offset(x: 10, y: -2)
                .accessibilityHidden(true)
        }
        .background(Color(red: 0.10, green: 0.21, blue: 0.32))
        .clipShape(.rect(cornerRadius: 18))
    }

    private func detail(_ label: String, value: String, symbol: String, tint: Color) -> some View {
        HStack(spacing: 8) {
            Image(systemName: symbol)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(tint)
                .frame(width: 28, height: 28)
                .background(tint.opacity(0.15), in: .circle)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.caption2).foregroundStyle(.white.opacity(0.78))
                Text(value).font(.footnote.weight(.semibold)).monospacedDigit()
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.12), in: .rect(cornerRadius: 14))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(value)
    }

    private var reminderLabel: String {
        switch glance.reminderKind {
        case "review": "到期复测"
        case "recap": "日终复盘"
        default: "学习提醒"
        }
    }
}

@main
struct YoziWatchApp: App {
    @State private var phone = PhoneGlance()
    private static let kitten = Bundle.main.path(forResource: "Kitten", ofType: "png")
        .flatMap { UIImage(contentsOfFile: $0) }

    var body: some Scene {
        WindowGroup {
            Group {
                if let glance = phone.current {
                    TodayView(glance: glance)
                } else {
                    VStack(spacing: 8) {
                        if let kitten = Self.kitten {
                            Image(uiImage: kitten)
                                .resizable()
                                .scaledToFit()
                                .frame(width: 52, height: 52)
                                .accessibilityHidden(true)
                        }
                        Text("暂无同步数据").font(.headline)
                        Text("打开手机上的 Yozi AI").font(.caption).foregroundStyle(.secondary)
                    }
                    .multilineTextAlignment(.center)
                }
            }
            .task { phone.start() }
        }
    }
}
