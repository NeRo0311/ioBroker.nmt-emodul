"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const axios = require("axios");
// const { url } = require('inspector');

// Load your modules here, e.g.:
// const fs = require("fs");

class NmtEmodul extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "nmt-emodul",
		});

		this.emodulApiClient = null;
		this.refreshStateTimeout = null;

		this.on("ready", this.onReady.bind(this));
		this.on("unload", this.onUnload.bind(this));
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		try {
			if (!this.config.userId) {
				this.log.error("User ID is empty - please check instance configuration of ${this.namespace}");
				return;
			}
			if (!this.config.token) {
				this.log.error("Token is empty - please check instance configuration of ${this.namespace}");
				return;
			}
			if (!this.config.heaterUdid) {
				this.log.error("Heater UDID is empty - please check instance configuration of ${this.namespace}");
				return;
			}

			this.log.debug("config userID: " + this.config.userId);
			this.log.debug("config token: " + this.config.token);
			this.log.debug("config heater UDID: " + this.config.heaterUdid);

			// read config
			const nmtUserID = this.config.userId;
			const nmtToken = this.config.token;
			const nmtUDID = this.config.heaterUdid;

			this.emodulApiClient = axios.create({
				method: "get",
				baseURL: "https://emodul.eu/api/v1/users/",
				headers: { Authorization: "Bearer " + nmtToken },
				responseType: "json",
				responseEncoding: "utf8",
				timeout: 1000,
				validateStatus: (status) => {
					return [200, 201, 401].includes(status);
				},
			});

			const nmtUrl = nmtUserID + "/modules/" + nmtUDID;
			await this.refreshState(nmtUrl);
		} finally {
			this.stop();
		}

		this.killTimeout = setTimeout(this.stop.bind(this), 10000);
	}

	async refreshState(nmtUrl) {
		try {
			const deviceInfoResponse = await this.emodulApiClient.get(nmtUrl);
			this.log.debug("deviceInfoResponse ${deviceInfoResponse.status}: ${JSON.stringify(deviceInfoResponse.data)}");

			if (deviceInfoResponse.status == 200) {
				const deviceData = deviceInfoResponse.data;
				console.log(deviceData);
				this.log.debug("deviceData: ${JSON.stringify(deviceData)}");
				this.setState("JSON", {val: JSON.stringify(deviceData)}, true);
				this.setDatapoints(deviceData);
			}
		} catch (error) {
			// Set device offline
			if (error.name === "AxiosError") {
				this.log.error("Request to ${error.config.url} failed with code ${error.status} (${error.code}): ${error.message}");
				this.log.debug("Complete error object: ${JSON.stringify(err)}");
			} else {
				this.log.error(error);
			}
		}
	}


	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.setStateAsync("info.connection", { val: false, ack: true });
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	async setDatapoints(deviceData) {
		// from object tiles to datapoints
		const jsonResponse = deviceData.tiles;
		let key, subkey, objectID;
		for (let i=0; i<jsonResponse.length; i++) {
			objectID = jsonResponse[i].id;
			for (key in jsonResponse[i]) {
				if (jsonResponse[i].hasOwnProperty(key)) {
					if (key == "params") {
						for (subkey in jsonResponse[i][key]) {
							if (jsonResponse[i][key].hasOwnProperty(subkey)) {
								this.setObjectNotExistsAsync("data." + objectID + "." + key + "." + subkey, {
									type: "state",
									common: {
										name: key,
										type: "string",
										role: "text",
										read: true,
										write: true,
									},
									native: {},
								});
								this.setState("data." + objectID + "." + key + "." + subkey, {val: jsonResponse[i][key][subkey], ack: true});
							}
						}
					} else {
						this.setObjectNotExistsAsync("data."+ objectID +"." + key, {
							type: "state",
							common: {
								name: key,
								type: "string",
								role: "text",
								read: true,
								write: true,
							},
							native: {},
						});
						this.setState("data." + objectID + "." + key, {val: jsonResponse[i][key], ack: true});
					}
				}
			}
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new NmtEmodul(options);
} else {
	// otherwise start the instance directly
	new NmtEmodul();
}