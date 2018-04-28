/**
 *
 * NavMenu (JS)
 *
 * @author Takuto Yanagida @ Space-Time Inc.
 * @version 2018-04-28
 *
 */


'use strict';

const { Menu } = require('electron');


class NavMenu {

	constructor(template) {
		this._menu = Menu.buildFromTemplate(template);
		this._idToMenuItem = new Map();
		this._initializeIdToMenuItemMap();
	}

	_initializeIdToMenuItemMap() {
		const scan = (items) => {
			for (let mi of items) {
				if (mi.id !== undefined) {
					this._idToMenuItem.set(mi.id, mi);
				}
				if (mi.submenu) {
					scan(mi.submenu.items);
				}
			}
		};
		scan(this._menu.items);
	}

	menu() {
		return this._menu;
	}

	menuItem(id) {
		return this._idToMenuItem.get(id);
	}

}

module.exports = NavMenu;
