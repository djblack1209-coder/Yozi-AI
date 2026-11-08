import Observation
import SwiftUI
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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                Text("今日学习").font(.headline).accessibilityAddTraits(.isHeader)
                if glance.total > 0 {
                    ProgressView(value: Double(glance.done), total: Double(glance.total)) {
                        Text("已完成 \(glance.done)／\(glance.total)")
                    }
                    .tint(Color(red: 0.68, green: 0.86, blue: 0.98))
                }
                Label("待复习 \(glance.due)", systemImage: "books.vertical")
                if let date = glance.reminder, date > .now {
                    Label {
                        Text(date.formatted(.dateTime.month().day().hour().minute()))
                    } icon: {
                        Image(systemName: "bell")
                    }
                    .accessibilityLabel(reminderLabel)
                    .accessibilityValue(date.formatted())
                    Text(reminderLabel).font(.caption2).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
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

    var body: some Scene {
        WindowGroup {
            Group {
                if let glance = phone.current {
                    TodayView(glance: glance)
                } else {
                    VStack(spacing: 8) {
                        Image(decorative: "Kitten")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 52, height: 52)
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
