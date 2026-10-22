// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-
/*
 * Snap Layouts & Top Snap Bar for Linux Mint (Cinnamon)
 * Replicates the Windows 11 Snap Layouts & Top Snap Bar experience.
 */

const { St, Clutter, Meta, GLib, Gio } = imports.gi;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;
const Settings = imports.ui.settings;

const UUID = "snap-layouts@pedro";

// Visual Metrics
const CARD_WIDTH = 76;
const CARD_HEIGHT = 52;
const ZONE_GAP = 3;

// Layout Presets (Windows 11 Presets)
const PRESETS = [
    {
        id: "two-half",
        key: "1",
        title: "2 Columns (50 / 50)",
        zones: [
            { id: "z1", x: 0.0, y: 0.0, w: 0.5, h: 1.0 },
            { id: "z2", x: 0.5, y: 0.0, w: 0.5, h: 1.0 }
        ]
    },
    {
        id: "two-unequal",
        key: "2",
        title: "2 Columns (67 / 33)",
        zones: [
            { id: "z1", x: 0.0, y: 0.0, w: 0.67, h: 1.0 },
            { id: "z2", x: 0.67, y: 0.0, w: 0.33, h: 1.0 }
        ]
    },
    {
        id: "three-equal",
        key: "3",
        title: "3 Columns (33 / 34 / 33)",
        zones: [
            { id: "z1", x: 0.0, y: 0.0, w: 1/3, h: 1.0 },
            { id: "z2", x: 1/3, y: 0.0, w: 1/3, h: 1.0 },
            { id: "z3", x: 2/3, y: 0.0, w: 1/3, h: 1.0 }
        ]
    },
    {
        id: "four-grid",
        key: "4",
        title: "4 Quadrants (2 x 2)",
        zones: [
            { id: "z1", x: 0.0, y: 0.0, w: 0.5, h: 0.5 },
            { id: "z2", x: 0.5, y: 0.0, w: 0.5, h: 0.5 },
            { id: "z3", x: 0.0, y: 0.5, w: 0.5, h: 0.5 },
            { id: "z4", x: 0.5, y: 0.5, w: 0.5, h: 0.5 }
        ]
    },
    {
        id: "three-priority",
        key: "5",
        title: "3 Zones (Half + 2 Quarters)",
        zones: [
            { id: "z1", x: 0.0, y: 0.0, w: 0.5, h: 1.0 },
            { id: "z2", x: 0.5, y: 0.0, w: 0.5, h: 0.5 },
            { id: "z3", x: 0.5, y: 0.5, w: 0.5, h: 0.5 }
        ]
    },
    {
        id: "three-center",
        key: "6",
        title: "3 Zones (Center Focus 25 / 50 / 25)",
        zones: [
            { id: "z1", x: 0.0, y: 0.0, w: 0.25, h: 1.0 },
            { id: "z2", x: 0.25, y: 0.0, w: 0.50, h: 1.0 },
            { id: "z3", x: 0.75, y: 0.0, w: 0.25, h: 1.0 }
        ]
    }
];

class SnapLayoutsExtension {
    constructor(metadata) {
        this.meta = metadata;
        this.enableTopSnapBar = true;
        this.enableShortcut = true;
        this.triggerDistance = 15;
        this.snapAnimation = true;

        this._settings = null;
        this._grabBeginId = 0;
        this._grabEndId = 0;
        this._trackerTimerId = 0;

        this._isDragging = false;
        this._draggedWindow = null;
        this._activeMonitor = null;

        this._snapBar = null;
        this._barZones = []; // [{ actor, rect, preset }]
        this._activeZone = null;
        this._activeTargetRect = null;
        this._ghostPreview = null;

        // Flyout (Super+Z)
        this._flyout = null;
        this._flyoutKeyId = null;
        this._flyoutStageEventId = 0;
        this._flyoutZones = [];
    }

    init() {
        try {
            this._settings = new Settings.ExtensionSettings(this, this.meta.uuid);
            this._settings.bindProperty(Settings.BindingDirection.IN, "enable-top-snap-bar", "enableTopSnapBar", () => {});
            this._settings.bindProperty(Settings.BindingDirection.IN, "enable-shortcut", "enableShortcut", () => this._updateShortcutState());
            this._settings.bindProperty(Settings.BindingDirection.IN, "trigger-distance", "triggerDistance", () => {});
            this._settings.bindProperty(Settings.BindingDirection.IN, "snap-animation", "snapAnimation", () => {});
        } catch (e) {
            this.enableTopSnapBar = true;
            this.enableShortcut = true;
            this.triggerDistance = 15;
            this.snapAnimation = true;
        }
    }

    enable() {
        // Connect to Muffin grab signals
        this._grabBeginId = global.display.connect('grab-op-begin', (...args) => {
            this._onGrabBegin(args);
        });

        this._grabEndId = global.display.connect('grab-op-end', (...args) => {
            this._onGrabEnd(args);
        });

        // Register Super+Z shortcut
        this._updateShortcutState();
    }

    disable() {
        if (this._grabBeginId) {
            global.display.disconnect(this._grabBeginId);
            this._grabBeginId = 0;
        }
        if (this._grabEndId) {
            global.display.disconnect(this._grabEndId);
            this._grabEndId = 0;
        }

        this._removeShortcut();
        this._stopTrackerTimer();
        this._destroySnapBar();
        this._destroyGhostPreview();
        this._destroyFlyout();

        this._isDragging = false;
        this._draggedWindow = null;
        this._activeMonitor = null;
        this._activeZone = null;
        this._activeTargetRect = null;

        if (this._settings) {
            this._settings.finalize();
            this._settings = null;
        }
    }

    _updateShortcutState() {
        this._removeShortcut();
        if (this.enableShortcut) {
            try {
                Main.keybindingManager.addHotKey('snap-layouts-flyout', '<Super>z', () => {
                    this._toggleFlyout();
                });
                this._flyoutKeyId = 'snap-layouts-flyout';
            } catch (e) {
                global.logError('[SnapLayouts] Failed to bind Super+Z: ' + e);
            }
        }
    }

    _removeShortcut() {
        if (this._flyoutKeyId) {
            try {
                Main.keybindingManager.removeHotKey(this._flyoutKeyId);
            } catch (e) {}
            this._flyoutKeyId = null;
        }
    }

    // --- Dynamic Argument Parser across Muffin versions ---

    _parseGrabArgs(args) {
        let window = null;
        let op = null;

        for (let i = 0; i < args.length; i++) {
            let arg = args[i];
            if (arg && typeof arg === 'object' && typeof arg.get_frame_rect === 'function') {
                window = arg;
            } else if (typeof arg === 'number') {
                op = arg;
            }
        }

        if (!window) {
            window = global.display.focus_window;
        }

        return { window, op };
    }

    // --- Drag and Drop (Top Snap Bar) ---

    _onGrabBegin(args) {
        if (!this.enableTopSnapBar) return;

        let { window, op } = this._parseGrabArgs(args);

        // Meta.GrabOp.MOVING == 1
        let isMove = (op === Meta.GrabOp.MOVING ||
                      op === (Meta.GrabOp.MOVING | Meta.GrabOp.KEYBOARD_MOVING) ||
                      op === 1);

        if (!isMove && typeof op === 'number') {
            isMove = ((op & Meta.GrabOp.MOVING) !== 0);
        }

        if (isMove && window) {
            this._isDragging = true;
            this._draggedWindow = window;
            this._activeZone = null;
            this._activeTargetRect = null;
            this._startTrackerTimer();
        }
    }

    _onGrabEnd(args) {
        if (!this._isDragging) return;

        this._stopTrackerTimer();
        this._isDragging = false;

        let targetRect = this._activeTargetRect;
        let window = this._draggedWindow;

        // Clean up UI
        this._destroyGhostPreview();
        this._hideSnapBar();

        // Snap window cleanly after Muffin grab cleanup
        if (targetRect && window) {
            GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                this._applyWindowGeometry(window, targetRect);
                return GLib.SOURCE_REMOVE;
            });
        }

        this._draggedWindow = null;
        this._activeZone = null;
        this._activeTargetRect = null;
        this._activeMonitor = null;
    }

    _startTrackerTimer() {
        this._stopTrackerTimer();
        this._trackerTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 16, () => {
            if (!this._isDragging) {
                this._trackerTimerId = 0;
                return GLib.SOURCE_REMOVE;
            }
            this._onDragTick();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTrackerTimer() {
        if (this._trackerTimerId) {
            GLib.source_remove(this._trackerTimerId);
            this._trackerTimerId = 0;
        }
    }

    _onDragTick() {
        let [x, y] = global.get_pointer();
        let monitor = this._getMonitorForCoords(x, y);
        if (!monitor) return;

        let workArea = this._getWorkArea(monitor);

        // Check Top Edge Trigger
        let isAtTopEdge = (y <= workArea.y + this.triggerDistance || y <= monitor.y + this.triggerDistance);

        if (!this._snapBar) {
            if (isAtTopEdge) {
                this._showSnapBar(monitor, workArea);
            }
        } else {
            // Monitor switched during drag
            if (this._activeMonitor && this._activeMonitor.index !== monitor.index) {
                this._destroySnapBar();
                this._destroyGhostPreview();
                if (isAtTopEdge) {
                    this._showSnapBar(monitor, workArea);
                }
                return;
            }

            // Hit test against zones inside the Snap Bar
            let hoveredZoneInfo = this._hitTestBarZones(x, y);

            if (hoveredZoneInfo) {
                if (this._activeZone !== hoveredZoneInfo) {
                    // Activate newly hovered cell
                    if (this._activeZone && this._activeZone.actor) {
                        this._activeZone.actor.remove_style_class_name('snap-zone-cell-active');
                    }
                    this._activeZone = hoveredZoneInfo;
                    this._activeZone.actor.add_style_class_name('snap-zone-cell-active');

                    // Compute target window rectangle
                    let z = hoveredZoneInfo.rect;
                    this._activeTargetRect = {
                        x: Math.round(workArea.x + z.x * workArea.width),
                        y: Math.round(workArea.y + z.y * workArea.height),
                        width: Math.round(workArea.width * z.w),
                        height: Math.round(workArea.height * z.h)
                    };

                    this._showGhostPreview(this._activeTargetRect);
                }
            } else {
                // Not over any zone
                if (this._activeZone) {
                    if (this._activeZone.actor) {
                        this._activeZone.actor.remove_style_class_name('snap-zone-cell-active');
                    }
                    this._activeZone = null;
                    this._activeTargetRect = null;
                    this._destroyGhostPreview();
                }

                // Check dismissal threshold: pointer moved away from the Snap Bar
                let [bx, by] = this._snapBar.get_transformed_position();
                let [bw, bh] = this._snapBar.get_transformed_size();

                if (y > by + bh + 80 || x < bx - 100 || x > bx + bw + 100) {
                    this._hideSnapBar();
                    this._destroyGhostPreview();
                }
            }
        }
    }

    _hitTestBarZones(x, y) {
        // 1. Exact cell bounds test
        for (let item of this._barZones) {
            if (!item.actor || !item.actor.get_stage()) continue;
            let [ax, ay] = item.actor.get_transformed_position();
            let [aw, ah] = item.actor.get_transformed_size();

            if (x >= ax && x <= ax + aw && y >= ay && y <= ay + ah) {
                return item;
            }
        }

        // 2. Forgiving hit test (within small margin around cells)
        for (let item of this._barZones) {
            if (!item.actor || !item.actor.get_stage()) continue;
            let [ax, ay] = item.actor.get_transformed_position();
            let [aw, ah] = item.actor.get_transformed_size();

            if (x >= ax - 4 && x <= ax + aw + 4 && y >= ay - 4 && y <= ay + ah + 4) {
                return item;
            }
        }

        return null;
    }

    _showSnapBar(monitor, workArea) {
        this._destroySnapBar();
        this._activeMonitor = monitor;

        this._snapBar = new St.BoxLayout({
            style_class: 'snap-bar-container',
            reactive: true
        });

        this._barZones = [];

        // Build Preset Cards
        for (let preset of PRESETS) {
            let cardWidget = this._createCardWidget(preset, this._barZones, null, null);
            this._snapBar.add_actor(cardWidget);
        }

        Main.uiGroup.add_actor(this._snapBar);

        // Position at top center of active monitor
        let barWidth = this._snapBar.get_preferred_width(-1)[1];
        let barHeight = this._snapBar.get_preferred_height(-1)[1];

        let posX = monitor.x + Math.round((monitor.width - barWidth) / 2);
        let targetY = workArea.y;

        this._snapBar.x = posX;

        if (this.snapAnimation) {
            this._snapBar.y = targetY - barHeight;
            this._snapBar.opacity = 0;
            Tweener.addTween(this._snapBar, {
                y: targetY,
                opacity: 255,
                time: 0.18,
                transition: 'easeOutQuad'
            });
        } else {
            this._snapBar.y = targetY;
            this._snapBar.opacity = 255;
        }
    }

    _hideSnapBar() {
        if (!this._snapBar) return;
        let bar = this._snapBar;
        this._snapBar = null;
        this._barZones = [];
        this._activeZone = null;

        if (this.snapAnimation) {
            let targetY = bar.y - bar.height;
            Tweener.addTween(bar, {
                y: targetY,
                opacity: 0,
                time: 0.14,
                transition: 'easeInQuad',
                onComplete: () => {
                    bar.destroy();
                }
            });
        } else {
            bar.destroy();
        }
    }

    _destroySnapBar() {
        if (this._snapBar) {
            Tweener.removeTweens(this._snapBar);
            this._snapBar.destroy();
            this._snapBar = null;
        }
        this._barZones = [];
        this._activeZone = null;
    }

    _createCardWidget(preset, zoneList, onZoneClick, onZoneHover) {
        let card = new St.Widget({
            style_class: 'snap-card',
            reactive: true
        });
        card.set_size(CARD_WIDTH, CARD_HEIGHT);

        for (let zone of preset.zones) {
            let left = Math.round(zone.x * CARD_WIDTH) + ZONE_GAP;
            let top = Math.round(zone.y * CARD_HEIGHT) + ZONE_GAP;
            let width = Math.round(zone.w * CARD_WIDTH) - (ZONE_GAP * 2);
            let height = Math.round(zone.h * CARD_HEIGHT) - (ZONE_GAP * 2);

            let cell = new St.Widget({
                style_class: 'snap-zone-cell',
                reactive: true
            });
            cell.set_position(left, top);
            cell.set_size(width, height);

            let zoneInfo = {
                actor: cell,
                rect: zone,
                preset: preset
            };

            if (zoneList) {
                zoneList.push(zoneInfo);
            }

            if (onZoneClick) {
                cell.connect('button-press-event', () => {
                    onZoneClick(zoneInfo);
                    return Clutter.EVENT_STOP;
                });
            }

            if (onZoneHover) {
                cell.connect('enter-event', () => {
                    cell.add_style_class_name('snap-zone-cell-active');
                    onZoneHover(zoneInfo, true);
                    return Clutter.EVENT_PROPAGATE;
                });
                cell.connect('leave-event', () => {
                    cell.remove_style_class_name('snap-zone-cell-active');
                    onZoneHover(zoneInfo, false);
                    return Clutter.EVENT_PROPAGATE;
                });
            }

            card.add_actor(cell);
        }

        return card;
    }

    // --- Ghost Preview ---

    _showGhostPreview(targetRect) {
        if (!this._ghostPreview) {
            this._ghostPreview = new St.Widget({
                style_class: 'snap-ghost-preview',
                reactive: false
            });
            Main.uiGroup.add_actor(this._ghostPreview);
            this._ghostPreview.set_position(targetRect.x, targetRect.y);
            this._ghostPreview.set_size(targetRect.width, targetRect.height);
            this._ghostPreview.opacity = 0;

            if (this.snapAnimation) {
                Tweener.addTween(this._ghostPreview, {
                    opacity: 255,
                    time: 0.12,
                    transition: 'easeOutQuad'
                });
            } else {
                this._ghostPreview.opacity = 255;
            }
        } else {
            if (this.snapAnimation) {
                Tweener.addTween(this._ghostPreview, {
                    x: targetRect.x,
                    y: targetRect.y,
                    width: targetRect.width,
                    height: targetRect.height,
                    opacity: 255,
                    time: 0.14,
                    transition: 'easeOutQuad'
                });
            } else {
                this._ghostPreview.set_position(targetRect.x, targetRect.y);
                this._ghostPreview.set_size(targetRect.width, targetRect.height);
                this._ghostPreview.opacity = 255;
            }
        }
    }

    _destroyGhostPreview() {
        if (this._ghostPreview) {
            Tweener.removeTweens(this._ghostPreview);
            this._ghostPreview.destroy();
            this._ghostPreview = null;
        }
    }

    // --- Geometry Application ---

    _applyWindowGeometry(window, rect) {
        if (!window) return;
        try {
            if (window.get_maximized()) {
                window.unmaximize(Meta.MaximizeFlags.BOTH);
            }
            window.move_resize_frame(true, rect.x, rect.y, rect.width, rect.height);
        } catch (e) {
            global.logError('[SnapLayouts] Error applying geometry: ' + e);
        }
    }

    // --- Flyout Mode (Super+Z Shortcut) ---

    _toggleFlyout() {
        if (this._flyout) {
            this._destroyFlyout();
            return;
        }

        let win = global.display.focus_window;
        if (!win || win.get_window_type() !== Meta.WindowType.NORMAL) {
            return;
        }

        let winRect = win.get_frame_rect();
        let monitor = this._getMonitorForCoords(winRect.x, winRect.y);
        let workArea = this._getWorkArea(monitor);

        this._flyout = new St.BoxLayout({
            style_class: 'snap-flyout-container',
            vertical: true,
            reactive: true
        });

        let header = new St.Label({
            text: "Snap Layouts (Click zone, press 1-6 or Esc)",
            style_class: 'snap-flyout-header'
        });
        this._flyout.add_actor(header);

        let cardsBox = new St.BoxLayout({
            vertical: false,
            reactive: true
        });
        this._flyout.add_actor(cardsBox);

        this._flyoutZones = [];

        for (let preset of PRESETS) {
            let cardWidget = this._createCardWidget(
                preset,
                this._flyoutZones,
                // On Click
                (zoneInfo) => {
                    let z = zoneInfo.rect;
                    let targetRect = {
                        x: Math.round(workArea.x + z.x * workArea.width),
                        y: Math.round(workArea.y + z.y * workArea.height),
                        width: Math.round(workArea.width * z.w),
                        height: Math.round(workArea.height * z.h)
                    };
                    this._destroyGhostPreview();
                    this._destroyFlyout();
                    this._applyWindowGeometry(win, targetRect);
                },
                // On Hover
                (zoneInfo, isHovering) => {
                    if (isHovering) {
                        let z = zoneInfo.rect;
                        let targetRect = {
                            x: Math.round(workArea.x + z.x * workArea.width),
                            y: Math.round(workArea.y + z.y * workArea.height),
                            width: Math.round(workArea.width * z.w),
                            height: Math.round(workArea.height * z.h)
                        };
                        this._showGhostPreview(targetRect);
                    } else {
                        this._destroyGhostPreview();
                    }
                }
            );
            cardsBox.add_actor(cardWidget);
        }

        Main.uiGroup.add_actor(this._flyout);

        // Position flyout centered horizontally on the active window or monitor
        let flyoutWidth = this._flyout.get_preferred_width(-1)[1];
        let flyoutHeight = this._flyout.get_preferred_height(-1)[1];

        let targetX = winRect.x + Math.round((winRect.width - flyoutWidth) / 2);
        let targetY = Math.max(workArea.y + 10, winRect.y + 20);

        // Constrain to monitor work area
        targetX = Math.max(workArea.x + 10, Math.min(targetX, workArea.x + workArea.width - flyoutWidth - 10));

        this._flyout.set_position(targetX, targetY);

        // Capture ESC, number keys 1-6, and click outside
        this._flyoutStageEventId = global.stage.connect('captured-event', (stage, event) => {
            let type = event.type();
            if (type === Clutter.EventType.KEY_PRESS) {
                let symbol = event.get_key_symbol();
                if (symbol === Clutter.KEY_Escape) {
                    this._destroyGhostPreview();
                    this._destroyFlyout();
                    return Clutter.EVENT_STOP;
                }

                // Handle number keys 1-6
                let keyMap = {
                    [Clutter.KEY_1]: 0,
                    [Clutter.KEY_2]: 1,
                    [Clutter.KEY_3]: 2,
                    [Clutter.KEY_4]: 3,
                    [Clutter.KEY_5]: 4,
                    [Clutter.KEY_6]: 5
                };

                if (symbol in keyMap) {
                    let presetIndex = keyMap[symbol];
                    let preset = PRESETS[presetIndex];
                    if (preset && preset.zones.length > 0) {
                        // Snap to primary zone (first zone) of preset
                        let z = preset.zones[0];
                        let targetRect = {
                            x: Math.round(workArea.x + z.x * workArea.width),
                            y: Math.round(workArea.y + z.y * workArea.height),
                            width: Math.round(workArea.width * z.w),
                            height: Math.round(workArea.height * z.h)
                        };
                        this._destroyGhostPreview();
                        this._destroyFlyout();
                        this._applyWindowGeometry(win, targetRect);
                        return Clutter.EVENT_STOP;
                    }
                }
            } else if (type === Clutter.EventType.BUTTON_PRESS) {
                let [ex, ey] = event.get_coords();
                let [fx, fy] = this._flyout.get_transformed_position();
                let [fw, fh] = this._flyout.get_transformed_size();
                if (ex < fx || ex > fx + fw || ey < fy || ey > fy + fh) {
                    this._destroyGhostPreview();
                    this._destroyFlyout();
                    return Clutter.EVENT_PROPAGATE;
                }
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _destroyFlyout() {
        if (this._flyoutStageEventId) {
            global.stage.disconnect(this._flyoutStageEventId);
            this._flyoutStageEventId = 0;
        }
        if (this._flyout) {
            this._flyout.destroy();
            this._flyout = null;
        }
        this._flyoutZones = [];
    }

    // --- Helpers ---

    _getMonitorForCoords(x, y) {
        let monitors = Main.layoutManager.monitors;
        for (let i = 0; i < monitors.length; i++) {
            let m = monitors[i];
            if (x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height) {
                return m;
            }
        }
        return Main.layoutManager.currentMonitor || monitors[0];
    }

    _getWorkArea(monitor) {
        try {
            let ws = global.workspace_manager ?
                     global.workspace_manager.get_active_workspace() :
                     global.screen.get_active_workspace();
            if (ws && ws.get_work_area_for_monitor) {
                let area = ws.get_work_area_for_monitor(monitor.index);
                if (area && area.width > 0 && area.height > 0) {
                    return area;
                }
            }
        } catch (e) {}

        return {
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height
        };
    }
}

let extension = null;

function init(metadata) {
    extension = new SnapLayoutsExtension(metadata);
    extension.init();
}

function enable() {
    if (extension) {
        extension.enable();
    }
    return extension;
}

function disable() {
    if (extension) {
        extension.disable();
    }
}
