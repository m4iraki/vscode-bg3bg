# BG3 Banks Helper for VS Code

BG3 Banks Helper is a specialized extension for Visual Studio Code designed to streamline the modding process for Baldur's Gate 3. It eases LSX and LOCA file navigation and identifiers management.

## Features

### GoTo Definition and Hover support
Preview name and type of locally defined Entities (Template, Visual, Material etc.), Localizations and Stats

### Localization Explorer
Manage all project localization strings in a centralized view.
- **Unified View:** See all localizations of selected value.
- **Multi-language Support:** If a key has multiple localizations, inline buttons (EN, RU, UA, etc.) appear on the tree item for instant navigation to the specific file.
- **Drag'n'Drop** loca directly to your xml or txt files. Pastes ID of dropped loca in your file possibly replacing id you dropped onto.

### LSX Entity Explorer
Navigate complex .lsx structures with ease.
- Objects are grouped by type (e.g., Textures, Template).
- Clicking a tree item jumps directly to the corresponding node in the source code.
- Drag'n'Drop entity directly to your lsx, xml or txt files. Pastes ID of dropped entity in your file possibly replacing id you dropped onto.

### Stats Explorer
As explorers before - all your stats are here.
- Displayed entry name and type.
- Hover shows detailed entry info.
- Clicking a tree item jumps directly to the corresponding node in the source code.
- Drag'n'Drop entity directly to your lsx, xml or txt files.

### Identifier Management
- **Generation:** Generate new UUIDs and Handles directly to your clipboard.
- **Regeneration:** Regenerate selected UUIDs and Handles replacing old value with generated in whole project.
- **Mass Regeneration:** Regenerate all identifiers of selected entity types across the entire project simplifying process of cloning or branching project.

### Toolkitify
- Creates *Baldur's Gate 3 Toolkit* like structure that you can copy into your Data folder to open project in Toolkit.
- Optionally allows to delete project files from Data folder.
- Project must be a valid Mod (meta.lsx is located at ./Mods/$folder/).

### Packaging
- Pack your project into .zip for sharing.
- Project must be a valid Mod (meta.lsx is located at ./Mods/$folder/).

### Hotload
Safely enable or disable hotloading of assets into your game to finetune your result. 

## Configuration

To enable conversion features, you must provide the path to divine.exe (from LSLib):

1. Open **Settings** (Ctrl+,).
2. Search for **BG3 Banks Helper**.
3. Enter the full path to the executable in the `Bg3bg: Divineexe` field. e.g. `G:\BG3 Modding\lslib\Tools\Divine.exe`
4. Enter the full path to the Data folder in the `Bg3bg: Gamedata` field. e.g. `G:\SteamLibrary\steamapps\common\Baldurs Gate 3\Data`

## Development

1. Clone the repository.
2. Install dependencies: `npm install`.
3. Press `F5` to open the Extension Development Host for debugging.