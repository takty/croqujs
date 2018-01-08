/*
 * Nav
 * 2016-08-10
 */

'use strict';

const {Menu} = require('electron');

class Nav {

	constructor(template) {
		this._menu = Menu.buildFromTemplate(template);
		this._idToMenuItem = new Map();
		this._initializeIdToMenuItemMap();
	}

	_initializeIdToMenuItemMap() {
		const scan = (items) => {
			for (let i = 0; i < items.length; i += 1) {
				const mi = items[i];
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

module.exports = Nav;
