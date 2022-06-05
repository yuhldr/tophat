'use strict';

// Copyright (C) 2020 Todd Kulesza <todd@dropline.net>

// This file is part of TopHat.

// TopHat is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// TopHat is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with TopHat. If not, see <https://www.gnu.org/licenses/>.

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const GTop = imports.gi.GTop;
const Clutter = imports.gi.Clutter;
const St = imports.gi.St;
const Shell = imports.gi.Shell;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Config = Me.imports.lib.config;
const Shared = Me.imports.lib.shared;

class MemUse {
    constructor(mem = 0, swap = 0) {
        this.mem = mem;
        this.swap = swap;
    }

    copy() {
        return new MemUse(this.mem, this.swap);
    }
}

class ProcessMemUse {
    constructor(pid = 0) {
        this.pid = pid;
        this.cmd = '';
        this.resident = 0;
        this.share = 0;
        // this.cpuTimeNow = 0;
        // this.cpuTimePrev = 0;
    }

    updateMem(mem) {
        this.resident = mem.resident;
        this.share = mem.share;
    }

    memUsage() {
        return ((this.resident - this.share) / 1024 / 1024).toFixed(1);
    }

    toString() {
        return `{cmd: ${this.cmd} mem: ${this.memUsage()} MB pid: ${this.pid}}`;
    }
}

// eslint-disable-next-line no-unused-vars
var TopHatMemIndicator = GObject.registerClass(
    class TopHatMemIndicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, `${Me.metadata.name} Memory Indicator`, false);

            // Initialize libgtop values
            this.mem = new GTop.glibtop_mem();
            this.swap = new GTop.glibtop_swap();
            this.memUsage = new MemUse();
            this.history = new Array(0);
            this.processes = new Map();

            let hbox = new St.BoxLayout();
            this.add_child(hbox);

            let gicon = Gio.icon_new_for_string(`${Me.path}/icons/mem-icon.svg`);
            let icon = new St.Icon({ gicon, icon_size: 24, style_class: 'icon' });
            hbox.add_child(icon);

            this._buildMeter(hbox);
            this._buildMenu();

            this.refreshChartsTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_MEM, () => this.refreshCharts());
            this.refreshProcessesTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Config.UPDATE_INTERVAL_PROCLIST, () => this.refreshProcesses());
        }

        _buildMeter(parent) {
            this.meter = new St.DrawingArea({ style_class: 'meter' });
            parent.add_child(this.meter);
            this.meter.connect('repaint', () => this.repaintMeter());
        }

        _buildMenu() {
            let statusMenu = new PopupMenu.PopupMenuSection();
            let grid = new St.Widget({
                style_class: 'menu-grid',
                layout_manager: new Clutter.GridLayout({ orientation: Clutter.Orientation.VERTICAL }),
            });
            let lm = grid.layout_manager;
            statusMenu.box.add_child(grid);

            let row = 0;
            let label = new St.Label({ text: 'Memory usage', style_class: 'menu-header' });
            lm.attach(label, 0, row, 2, 1);
            row++;

            label = new St.Label({ text: 'RAM used:', style_class: 'menu-label' });
            lm.attach(label, 0, row, 1, 1);
            this.menuMemUsage = new St.Label({ text: '0%', style_class: 'menu-value' });
            lm.attach(this.menuMemUsage, 1, row, 1, 1);
            row++;

            label = new St.Label({ text: 'Swap used:', style_class: 'menu-label' });
            lm.attach(label, 0, row, 1, 1);
            this.menuSwapUsage = new St.Label({ text: '0%', style_class: 'menu-value' });
            lm.attach(this.menuSwapUsage, 1, row, 1, 1);
            row++;

            this.historyChart = new St.DrawingArea({ style_class: 'chart' });
            this.historyChart.connect('repaint', () => this.repaintHistory());
            lm.attach(this.historyChart, 0, row, 2, 1);
            row++;

            // FIXME: Don't hardcode this, base it on Config.HISTORY_MAX_SIZE
            label = new St.Label({ text: '2 mins ago', style_class: 'chart-label-then' });
            lm.attach(label, 0, row, 1, 1);
            label = new St.Label({ text: 'now', style_class: 'chart-label-now' });
            lm.attach(label, 1, row, 1, 1);
            row++;

            label = new St.Label({ text: 'Top processes', style_class: 'menu-header' });
            lm.attach(label, 0, row, 2, 1);
            row++;

            this.topProcesses = new Array();
            for (let i = 0; i < Config.N_TOP_PROCESSES; i++) {
                let cmd = new St.Label({ text: '', style_class: 'menu-cmd-name' });
                lm.attach(cmd, 0, row, 1, 1);
                let usage = new St.Label({ text: '', style_class: 'menu-mem-usage' });
                lm.attach(usage, 1, row, 1, 1);
                let p = new Shared.TopProcess(cmd, usage);
                this.topProcesses.push(p);
                row++
            }

            this.menu.addMenuItem(statusMenu);

            let appSys = Shell.AppSystem.get_default();
            let app = appSys.lookup_app('gnome-system-monitor.desktop');
            let menuItem = new PopupMenu.PopupImageMenuItem('System Monitor', 'utilities-system-monitor-symbolic');
            menuItem.connect('activate', () => {
                this.menu.close(true);
                app.activate();
            });
            this.menu.addMenuItem(menuItem);
        }

        refreshCharts() {
            GTop.glibtop_get_mem(this.mem);
            let memTotal = this.mem.total / 1024 / 1024;
            let memUsed = (this.mem.used - this.mem.cached) / 1024 / 1024;
            this.memUsage.mem = Math.round(memUsed / memTotal * 100);
            this.menuMemUsage.text = `${this.memUsage.mem}%`;

            GTop.glibtop_get_swap(this.swap);
            let swapTotal = this.swap.total / 1024 / 1024;
            let swapUsed = this.swap.used / 1024 / 1024;
            this.memUsage.swap = Math.round(swapUsed / swapTotal * 100);
            this.menuSwapUsage.text = `${this.memUsage.swap}%`;
            while (this.history.length >= Config.HISTORY_MAX_SIZE)
                this.history.shift();
            this.history.push(this.memUsage.copy());

            this.meter.queue_repaint();
            this.historyChart.queue_repaint();

            return true;
        }

        refreshProcesses() {
            // Build list of N most memory-hungry processes
            let processes = Shared.getProcessList();

            let updatedProcesses = new Map();
            processes.forEach(pid => {
                let procInfo = this.processes.get(pid);
                if (procInfo === undefined) {
                    procInfo = new ProcessMemUse(pid);
                    procInfo.cmd = Shared.getProcessName(pid);
                }

                if (procInfo.cmd) {
                    let mem = new GTop.glibtop_proc_mem;
                    GTop.glibtop_get_proc_mem(mem, pid);
                    procInfo.updateMem(mem);
                    updatedProcesses.set(pid, procInfo);
                    // log(`${procInfo}`);
                }
            });
            this.processes = updatedProcesses;

            // Get the top 5 processes by CPU usage
            let procList = new Array(0);
            this.processes.forEach(e => {
                // if (e.memUsage() > 0) {
                    procList.push(e);
                // }
            })
            procList.sort((a, b) => { return b.memUsage() - a.memUsage(); });
            procList = procList.slice(0, Config.N_TOP_PROCESSES);
            while (procList.length < Config.N_TOP_PROCESSES) {
                // If we don't have at least N_TOP_PROCESSES active, fill out
                // the array with empty ones
                procList.push(new ProcessMemUse());
            }
            for (let i = 0; i < Config.N_TOP_PROCESSES; i++) {
                this.topProcesses[i].cmd.text = procList[i].cmd;
                let memUse = '';
                if (procList[i].cmd) {
                    memUse = procList[i].memUsage() + ' MB';
                }
                this.topProcesses[i].usage.text = memUse;
            }

            return true;
        }
// cmd=gnome-shell pid=54512 size=4463 vsize=4463 resident=433

        repaintMeter() {
            let [width, height] = this.meter.get_surface_size();
            let ctx = this.meter.get_context();
            var _, fg, bg;
            [_, fg] = Clutter.Color.from_string(Config.METER_FG_COLOR);
            [_, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

            Clutter.cairo_set_source_color(ctx, bg);
            ctx.rectangle(0, 0, width, height);
            ctx.fill();

            Clutter.cairo_set_source_color(ctx, fg);
            let fillHeight = Math.ceil(this.memUsage.mem / 100.0 * height);
            ctx.rectangle(0, height - fillHeight, width, height);
            ctx.fill();

            ctx.$dispose();
        }

        repaintHistory() {
            let [width, height] = this.historyChart.get_surface_size();
            let pointSpacing = width / (Config.HISTORY_MAX_SIZE - 1);
            let xStart = (Config.HISTORY_MAX_SIZE - this.history.length) * pointSpacing;
            let ctx = this.historyChart.get_context();
            var _, fg, bg;
            [_, fg] = Clutter.Color.from_string(Config.METER_FG_COLOR);
            [_, bg] = Clutter.Color.from_string(Config.METER_BG_COLOR);

            Clutter.cairo_set_source_color(ctx, bg);
            ctx.rectangle(0, 0, width, height);
            ctx.fill();

            Clutter.cairo_set_source_color(ctx, fg);
            ctx.moveTo(xStart, height);
            for (let i = 0; i < this.history.length; i++) {
                let pointHeight = Math.ceil(this.history[i].mem / 100.0 * height);
                let x = xStart + pointSpacing * i;
                let y = height - pointHeight;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(xStart + (this.history.length - 1) * pointSpacing, height);
            ctx.closePath();
            ctx.fill();

            ctx.$dispose();
        }

        destroy() {
            if (this.refreshChartsTimer !== 0) {
                GLib.source_remove(this.refreshChartsTimer);
                this.refreshChartsTimer = 0;
            }
            super.destroy();
        }
    });