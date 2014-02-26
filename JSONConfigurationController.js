var util  = require('util');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');
var moment = require('moment');
var schedule = require('node-schedule');
var AmazonSNSPublisher = require('./amazonSNSPublisher.js');

function JSONConfigurationController(configFile) {
	var _self = this;
	var _configFile = configFile || undefined;
	var _configComplete = false;
	var _configCompleteCallback;
	var _configResetCallback;
	var _dateformat = "YYYY/MM/DD HH:mm:ss";
	var _reCheckConfigurationJob;

	this.amazonSNSPublisher;
	this.data;

	this.setConfiguration = function (configFile) {
		_configFile = configFile;

		this._clearConfiguration();
		this._loadConfiguration();
		this._monitor();
	}

	this.on = function (onEvent, eventFunction) {
		if (onEvent == "configComplete") {
			_configCompleteCallback = eventFunction;

			if (_configComplete) {
				_configCompleteCallback();		
			}
		}
		else if (onEvent == "reset") {
			_configResetCallback = eventFunction;
		}
	}

	this._clearConfiguration = function () {
		_self.amazonSNSPublisher = undefined;

		if (typeof(_configResetCallback) !== 'undefined') {
			_configResetCallback();
		}
	}

	this._monitor = function () {
		// watch the configuration file for changes.  reload if anything changes
		fs.watchFile(_configFile, function (event, filename) {
			console.log("** (" + _self._getCurrentTime() + ") RELOADING CONFIGURATION");

			_self._clearConfiguration();
			_self._loadConfiguration();
		});		
	}

	this._loadConfiguration = function () {
		console.log("** (" + this._getCurrentTime() + ") Loading the configuration from " + _configFile);
		
		fs.readFile(_configFile, 'utf8', function (err, fileData) {
			if (err) {
				console.log("** (" + _self._getCurrentTime() + ") ERROR LOADING CONFIGURATION: " + err);
				return;
			}

			try {
				_self.data = JSON.parse(fileData);

				if (_self.data.Debug) {
					console.log("** (" + _self._getCurrentTime() + ") CONFIGURATION: DEBUG turned on");
				}
			}
			catch (err) {
				console.log("** (" + _self._getCurrentTime() + ") CONFIGURATION: Got an error.  Going to schedule a re-check in 3 minutes. Error: " + err);
				console.log(err.stack);
								
				// going to keep trying until we get it right.
				if (typeof _reCheckConfigurationJob !== 'undefined') {
					_reCheckConfigurationJob.cancel();
					_reCheckConfigurationJob = undefined;
				}

				var recheckTime = moment().add('m', 3).format(_dateformat);

				_reCheckConfigurationJob = schedule.scheduleJob(recheckTime, function() {
					_self._clearConfiguration();
					_self._loadConfiguration();

					_reCheckConfigurationJob = undefined;
				});
			}

			if (_self.data.AWS) {
				_self.amazonSNSPublisher = new AmazonSNSPublisher();
				_self.amazonSNSPublisher.configureAWSCredentials(
					_self.data.AWS.defaultRegion, 
					_self.data.AWS.accessKeyId,
					_self.data.AWS.secretAccessKey);
			}

			_configComplete = true;

			if (typeof(_configCompleteCallback) !== 'undefined') {
				_configCompleteCallback();
			}
		});
	}

	this._getCurrentTime = function () {
		return moment().format(_dateformat);
	}
}

module.exports = JSONConfigurationController;