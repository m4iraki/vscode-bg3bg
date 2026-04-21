# BG3 Banks Helper for VS Code

BG3 Banks Helper is a specialized extension for Visual Studio Code designed to streamline the modding process for Baldur's Gate 3. It automates localization management, LSX file navigation, and identifier synchronization.

## Features

### Localization Explorer
Manage all project localization strings in a centralized view.
- **Unified View:** Groups all XML entries by their contentuid (Handle).
- **Display Priority:** Automatically displays English text. if English is unavailable, it defaults to Russian, or the first available translation found.
- **Multi-language Support:** If a key has multiple localizations, inline buttons (EN, RU, UA, etc.) appear on the tree item for instant navigation to the specific file.
- **Live Sync:** The tree updates automatically when XML files in the Localization folder are saved or deleted.

### LSX Entity Explorer
Navigate complex .lsx structures with ease.
- Objects are grouped by type (e.g., Textures, GameObjects).
- Clicking a tree item jumps directly to the corresponding node in the source code.

### Identifier Management
- **Generation:** Generate new UUIDs and Handles (BG3 format: h...g...) directly to your clipboard.
- **Mass Regeneration:** Replace all identifiers in a selection or across the entire project with new unique values, simplifying the process of cloning existing assets.

### Toolkitify (LSLib Integration)
Automates resource compilation using divine.exe.
- Converts .lsx structures to .lsf while maintaining the mod's folder hierarchy.
- Includes a dirty-file check to ensure all changes are saved before conversion begins.

## Configuration

To enable conversion features, you must provide the path to divine.exe (from LSLib):

1. Open **Settings** (Ctrl+,).
2. Search for **BG3 Banks Helper**.
3. Enter the full path to the executable in the `Bg3bg: Divineexe` field.

## Project Structure

| File | Description |
| :--- | :--- |
| loca.ts | Core localization logic: XML parsing, LocaStorage, and TreeView provider. |
| lsx.ts | SAX parser for LSX files and entity tree implementation. |
| identifiers.ts | Regex logic and replacement functions for UUIDs and Handles. |
| toolkitify.ts | Wrapper for the divine.exe CLI for batch processing. |
| util.ts | File system utilities, logging, and QuickPick helpers. |
| package.json | Manifest file containing command declarations and menu contributions. |

## Development

1. Clone the repository.
2. Install dependencies: `npm install`.
3. Press `F5` to open the Extension Development Host for debugging.