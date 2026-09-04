import AppIntents
import SwiftUI
import WidgetKit

/**
 ホーム画面ウィジェット「かいものリスト」。

 ■ iOSの制限について
 WidgetKit のウィジェットはスクロールできない (ScrollView は使えず、静止した
 スナップショットとして描画される)。そのため長いリストは「ページ送り」で見る:
 ウィジェット下部の ◀ ▶ ボタン (iOS 17以降の対話型ウィジェット) で表示範囲をずらす。
 品目のタップでチェックの付け外しもできる。

 ■ 有効化の手順 (有料の Apple Developer Program 登録後)
 1. Xcode で File > New > Target… > Widget Extension を追加する
    (名前: ShoppingListWidget / "Include Live Activity" と "Include Configuration Intent" は不要)
 2. 自動生成されたテンプレートのSwiftファイルを削除し、このフォルダの
    ShoppingListWidget.swift と SharedSnapshot.swift をウィジェット拡張ターゲットに追加する
 3. アプリ本体ターゲットにも、SharedSnapshot.swift と App/WidgetBridgePlugin.swift を追加する
    (Xcodeにファイルを追加するまではビルドが通らないので、この2つはセットで行う)
 4. App/MainViewController.swift の registerPluginInstance(WidgetBridgePlugin()) のコメントを外す
 5. アプリ本体・ウィジェット拡張の両方に Signing & Capabilities > App Groups を追加し、
    どちらにも group.com.kaimonoroute.app を作成/選択する
 6. ウィジェット拡張の Deployment Target を iOS 17.0 以上にする
 (App Groups は無料のPersonal Teamでは追加できないため、有料登録までは動作しない)
 */

// MARK: - 表示するリストの選択 (ウィジェットを長押し → ウィジェットを編集)

@available(iOS 17.0, *)
struct ListEntity: AppEntity {
    var id: String
    var name: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation { "買い物リスト" }
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
    static var defaultQuery = ListEntityQuery()
}

@available(iOS 17.0, *)
struct ListEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [ListEntity] {
        allLists().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [ListEntity] {
        allLists()
    }

    private func allLists() -> [ListEntity] {
        (SharedStore.loadSnapshot()?.lists ?? []).map { ListEntity(id: $0.id, name: $0.name) }
    }
}

@available(iOS 17.0, *)
struct SelectListIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "リストを選ぶ" }
    static var description: IntentDescription { "ウィジェットに表示する買い物リストを選びます。" }

    /// 未選択のときはアプリで開いているリストを表示する
    @Parameter(title: "買い物リスト")
    var list: ListEntity?
}

// MARK: - ウィジェット上の操作 (iOS 17以降)

@available(iOS 17.0, *)
struct ToggleItemIntent: AppIntent {
    static var title: LocalizedStringResource { "チェックを切り替える" }

    @Parameter(title: "listId") var listId: String
    @Parameter(title: "itemId") var itemId: String
    @Parameter(title: "checked") var checked: Bool

    init() {}

    init(listId: String, itemId: String, checked: Bool) {
        self.listId = listId
        self.itemId = itemId
        self.checked = checked
    }

    func perform() async throws -> some IntentResult {
        // ウィジェットからは localStorage を直接書けないので、変更を積んでおき、
        // アプリが次に起動/復帰したときに取り込んでもらう。
        SharedStore.appendPendingChange(
            PendingChange(listId: listId, itemId: itemId, checked: checked, at: Date().timeIntervalSince1970 * 1000)
        )
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

@available(iOS 17.0, *)
struct ChangePageIntent: AppIntent {
    static var title: LocalizedStringResource { "表示するページを変える" }

    @Parameter(title: "listId") var listId: String
    @Parameter(title: "delta") var delta: Int

    init() {}

    init(listId: String, delta: Int) {
        self.listId = listId
        self.delta = delta
    }

    func perform() async throws -> some IntentResult {
        SharedStore.setPage(SharedStore.page(listId: listId) + delta, listId: listId)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

// MARK: - タイムライン

struct ShoppingListEntry: TimelineEntry {
    var date: Date
    var list: SharedList?
    var page: Int
    /// App Group が未設定、またはアプリ側がまだ一度も書き出していない
    var notReady: Bool
}

@available(iOS 17.0, *)
struct ShoppingListProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> ShoppingListEntry {
        ShoppingListEntry(date: Date(), list: sampleList, page: 0, notReady: false)
    }

    func snapshot(for configuration: SelectListIntent, in context: Context) async -> ShoppingListEntry {
        entry(for: configuration)
    }

    func timeline(for configuration: SelectListIntent, in context: Context) async -> Timeline<ShoppingListEntry> {
        // 内容が変わるのはアプリ側の書き出し時 (その都度 reloadAllTimelines される) なので、
        // 時間による自動更新は保険として1時間ごとに留める。
        Timeline(entries: [entry(for: configuration)], policy: .after(Date().addingTimeInterval(60 * 60)))
    }

    private func entry(for configuration: SelectListIntent) -> ShoppingListEntry {
        guard let snapshot = SharedStore.loadSnapshot() else {
            return ShoppingListEntry(date: Date(), list: nil, page: 0, notReady: true)
        }
        guard let list = snapshot.list(id: configuration.list?.id) else {
            return ShoppingListEntry(date: Date(), list: nil, page: 0, notReady: false)
        }
        let resolved = SharedStore.applyPendingChanges(to: list)
        return ShoppingListEntry(date: Date(), list: resolved, page: SharedStore.page(listId: resolved.id), notReady: false)
    }

    private var sampleList: SharedList {
        SharedList(
            id: "sample",
            name: "買い物リスト",
            color: "#7cb342",
            items: [
                SharedItem(id: "1", text: "牛乳", checked: false, color: "#fdd835"),
                SharedItem(id: "2", text: "にんじん 2本", checked: false, color: "#7cb342"),
                SharedItem(id: "3", text: "食パン", checked: true, color: "#a1887f"),
            ]
        )
    }
}

// MARK: - 表示

@available(iOS 17.0, *)
struct ShoppingListWidgetView: View {
    var entry: ShoppingListEntry
    @Environment(\.widgetFamily) private var family

    private var rowsPerPage: Int {
        switch family {
        case .systemSmall: return 3
        case .systemMedium: return 5
        default: return 11
        }
    }

    private var showsControls: Bool { family != .systemSmall }

    var body: some View {
        if entry.notReady {
            placeholderText("アプリを一度開くと、ここにリストが表示されます。")
        } else if let list = entry.list {
            content(list: list)
        } else {
            placeholderText("表示するリストがありません。")
        }
    }

    private func placeholderText(_ text: String) -> some View {
        VStack {
            Spacer()
            Text(text)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Spacer()
        }
    }

    private func content(list: SharedList) -> some View {
        // ページ範囲を実際の件数に合わせて丸める (品目が減ったときに空ページを出さない)
        let pageCount = max(1, Int(ceil(Double(list.items.count) / Double(rowsPerPage))))
        let page = min(max(0, entry.page), pageCount - 1)
        let start = page * rowsPerPage
        let visible = Array(list.items.dropFirst(start).prefix(rowsPerPage))

        return VStack(alignment: .leading, spacing: 5) {
            header(list: list)

            ForEach(visible) { item in
                row(listId: list.id, item: item)
            }

            if visible.isEmpty {
                Text("品目がありません").font(.caption).foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)

            if showsControls && pageCount > 1 {
                pager(listId: list.id, page: page, pageCount: pageCount)
            }
        }
    }

    private func header(list: SharedList) -> some View {
        HStack(spacing: 5) {
            Circle()
                .fill(Color(hex: list.color) ?? .accentColor)
                .frame(width: 8, height: 8)
            Text(list.name)
                .font(.caption.bold())
                .lineLimit(1)
            Spacer(minLength: 0)
            Text("\(list.remaining)/\(list.items.count)")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func row(listId: String, item: SharedItem) -> some View {
        Button(intent: ToggleItemIntent(listId: listId, itemId: item.id, checked: !item.checked)) {
            HStack(spacing: 6) {
                Image(systemName: item.checked ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 13))
                    .foregroundStyle(item.checked ? Color.secondary : (Color(hex: item.color) ?? .accentColor))
                Text(item.text)
                    .font(.caption)
                    .lineLimit(1)
                    .strikethrough(item.checked)
                    .foregroundStyle(item.checked ? .secondary : .primary)
                Spacer(minLength: 0)
            }
        }
        .buttonStyle(.plain)
    }

    private func pager(listId: String, page: Int, pageCount: Int) -> some View {
        HStack(spacing: 8) {
            Button(intent: ChangePageIntent(listId: listId, delta: -1)) {
                Image(systemName: "chevron.left").font(.caption2)
            }
            .buttonStyle(.plain)
            .disabled(page == 0)
            .opacity(page == 0 ? 0.3 : 1)

            Text("\(page + 1) / \(pageCount)")
                .font(.caption2)
                .foregroundStyle(.secondary)

            Button(intent: ChangePageIntent(listId: listId, delta: 1)) {
                Image(systemName: "chevron.right").font(.caption2)
            }
            .buttonStyle(.plain)
            .disabled(page >= pageCount - 1)
            .opacity(page >= pageCount - 1 ? 0.3 : 1)
        }
        .frame(maxWidth: .infinity)
    }
}

@available(iOS 17.0, *)
struct ShoppingListWidget: Widget {
    let kind = "ShoppingListWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: SelectListIntent.self, provider: ShoppingListProvider()) { entry in
            ShoppingListWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("かいものリスト")
        .description("買い物リストの中身を表示します。長押しして表示するリストを選べます。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@available(iOS 17.0, *)
@main
struct ShoppingListWidgetBundle: WidgetBundle {
    var body: some Widget {
        ShoppingListWidget()
    }
}

extension Color {
    /// "#rrggbb" 形式の文字列から色を作る (解釈できなければ nil)。
    init?(hex: String?) {
        guard var value = hex?.trimmingCharacters(in: .whitespaces) else { return nil }
        if value.hasPrefix("#") { value.removeFirst() }
        guard value.count == 6, let rgb = UInt32(value, radix: 16) else { return nil }
        self.init(
            .sRGB,
            red: Double((rgb >> 16) & 0xff) / 255,
            green: Double((rgb >> 8) & 0xff) / 255,
            blue: Double(rgb & 0xff) / 255,
            opacity: 1
        )
    }
}
