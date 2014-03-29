var JSONConfigurationController = require("./JSONConfigurationController.js");
var AmazonSNSPublisher = require("./amazonSNSPublisher.js");
var moment = require('moment');
var exec = require('child_process').exec;
var util = require('util');
var schedule = require('node-schedule');
var csv = require('csv');
var needle = require('needle');
var nodemailer = require("nodemailer");
var push = require( 'pushover-notifications' );

/*
	Fing Output example:
		2013/12/12 18:14:32;up;10.66.0.11;;camera2.home.mikelamoureux.net;F0:7D:68:09:B7:6B;D-Link

	Fing Array:
		[0]: Date
		[1]: State (up, down, changed)
		[2]: IP Address
		[3]: Unknown
		[4]: DNS Domain
		[5]: Mac Address
		[6]: Manufacturer
		[7]: Common Known Name

	[NetworkDevices]:
		[0] = Mac Address
		[1] = State
		[2] = IP Address
		[3] = White Listed (true or false)
		[4] = Alert Device (true or false)
		[5] = Manufacturer
		[6] = Fing Timestamp
		[7] = Timeout expiration for declaring "off" network
		[8] = Previously Reported (for non-whitelisted devices)
		[9] = Fully qualified domain name
		[10] = Indigo State
*/

function NetworkDevice(mac, ip, fqdn, manufacturer) {
	var _self = this,
		_AWS_SNS,
		_configuration,
		_dateformat = "YYYY/MM/DD HH:mm:ss",
		_mac = mac || 'none',
		_state,
		_syncState,
		_syncStateTimestamp,		
		_ip = ip || 'none',
		_manufacturer,
		_fingTimestamp,
		_fqdn = fqdn || 'none',
		_alertMethods;

	this._getCurrentTime = function () {
		return (moment().format(_dateformat));
	}

	this.getMACAddress = function () {
		return _mac;
	}

	this.getIPAddress = function () {
		return _ip;
	}

	this.getManufacturer = function () {
		return _manufacturer;
	}

	this.getFQDN = function () {
		return _fqdn;
	}

	this.getDeviceState = function () {

		if (typeof _state === 'undefined') return undefined;
		if (typeof(_state) == "boolean") return (_state);

		switch (_state.toUpperCase())
		{
			case "UP":
				return (true);
			case "TRUE":
				return (true);
			case "DOWN":
				return (false);
			case "FALSE":
				return (false);
		}

		return false;
	}

	this.setFingTimestamp = function () {
		_fingTimestamp = getCurrentTime();
	}

	this.setMAC = function (mac) {
		_mac = mac;
	}

	this.getSyncState = function() {
		return _syncState;
	}

	this.setIPAddress = function(ip) {
		_ip = ip;
	}

	this.setDeviceState = function (state) {
		var stateChanged = _syncState != state;

		console.log("** (" + this._getCurrentTime() + ") Device state for " + this.getMACAddress() + " is being set to " + state);

		// Alert Device Stuff
		// if the device is off and the previous state was on and it's an alert device, update the alert expiration
		if (!state && state != this.getDeviceState() && this.isAlertDevice())
		{
			this._scheduleAlert(_alertOffNetworkTTL);
		}
		// if the device is on and it's an alert device
		else if (state && this.isAlertDevice())
		{
			// if there was a job scheduled to send that the device is off, cancel the job
			if  (typeof _scheduledAlertJob !== 'undefined')
			{
				console.log("** (" + this._getCurrentTime() + ") Cancelled the alert for device " + this.getAlertDeviceName());

				_scheduledAlertJob.cancel();
				_scheduledAlertJob = undefined;
			}

			if (typeof _scheduledWakeupJob !== 'undefined')
			{
				console.log("** (" + this._getCurrentTime() + ") Cancelled the wakeup for device " + this.getAlertDeviceName());
				_scheduledWakeupJob.cancel();
				_scheduledWakeupJob	 = undefined;
			}
		}

		_state = state;
		_fingTimestamp = this._getCurrentTime();

		// White List Device Stuff
		if (this._isReadyforWhiteListAlert())
		{
			this._reportUnknownDevice();
		}

		if (stateChanged && this._isReadyforAlert())
		{
			this._alertDevice();
		}
	}

	this._prepare_SNS_Message = function(deviceState) {
		var object = { mac: this.getMACAddress(), state: deviceState, timestamp: this._getCurrentTime() };
		var json = JSON.stringify(object);

		return json;
	}

	this._isReadyforWhiteListAlert = function () {
		return (this.getDeviceState() && !this.isWhiteListedDevice() && !_unknownDeviceReported);	
	}

	this.setFQDN = function (fqdn) {
		_fqdn = fqdn;
	}

	this.setManufacturer = function (manufacturer) {
		_manufacturer = manufacturer;
	}

	this.setConfiguration = function (configuration) {
		if (typeof _configuration === 'undefined') console.log("** (" + this._getCurrentTime() + ") Configuration for " + this.getMACAddress() + " is being set");

		_configuration = configuration;
	}

// **************************************************************************
// White List Functions

	var _whiteListed = false,
		_unknownDeviceReported = false,
		_unknownDeviceReportedTimestamp,
		_whiteListDeviceName,
		_whiteListCheckJob;

	this.isWhiteListedDevice = function () {
		return _whiteListed;
	}

	this.clearUnknownDeviceReportedFlag = function () {
		_unknownDeviceReported = false;

		this._scheduleWhiteListCheck(10);
	}

// **************************************************************************
// Alert Functions

	var _alertDevice = false,
		_lastAlertSent,
		_alertDeviceName,
		_alertMode,
		_alertIndigoVariableURL,
		_alertOffNetworkTTL,
		_scheduledAlertDate,
		_scheduledAlertJob,
		_scheduledIndigoRefresh = false,
		_scheduledIndigoRefreshIntervalID,
		_wakeMethods;

	this.getScheduledAlertDate = function () {
		return _scheduledAlertDate;
	}

	this.getAlertDeviceName = function () {
		if (typeof _alertDeviceName === 'undefined') return this.getMACAddress();
		if (_alertDeviceName.length == 0) return this.getMACAddress();
		return _alertDeviceName;
	}

	this.isAlertDevice = function () {
		if (typeof(_alertMethods) === 'undefined') {
			return false;
		}

		return _alertDevice && _alertMethods.length > 0;
	}


// **************************************************************************
// Public Functions

	this.setWhiteListDevice = function (whiteListDeviceName) {
		_whiteListed = true;
		_whiteListDeviceName = whiteListDeviceName;
		console.log("** (" + this._getCurrentTime() + ") Whitelisted device has been marked for " + whiteListDeviceName);

		if (typeof _whiteListCheckJob !== 'undefined')
		{
			_whiteListCheckJob.cancel();
			_whiteListCheckJob = undefined;
		}				
	}

	this.clearWhiteListDevice = function () {
		// this function gets called when configuration is being reset.  If the whitelist status is changed, we need to report the device if it is no loger cleared.
		// This block of code is going to schedule a check to see if the device needs to be reported in 2 minutes.

		_whiteListed = false;
		_whiteListDeviceName = undefined;
		_unknownDeviceReported = false;

		this._scheduleWhiteListCheck(2);
	}

	this._scheduleWhiteListCheck = function(addMinutes) {
		if (typeof _whiteListCheckJob !== 'undefined') {
			_whiteListCheckJob.cancel();
			_whiteListCheckJob = undefined;
		}

		// Add two minutes to the current time.
		var recheckWhiteListStatus = moment().add('m', addMinutes).format(_dateformat);

		_whiteListCheckJob = schedule.scheduleJob(recheckWhiteListStatus, function() {
			console.log("** (" + _self._getCurrentTime() + ") Checking (via Scheduled) whitelist status for " + _self.getMACAddress());

			// White List Device Stuff
			if (_self._isReadyforWhiteListAlert())
			{
				_self._reportUnknownDevice();
			}

			_whiteListCheckJob = undefined;
		});
	}

	this.clearAlertDevice = function () {
		alertDevice = false;
		alertDeviceName = undefined;
		alertMode = undefined;
		alertIndigoVariableURL = undefined;
		alertOffNetworkTTL = undefined;

		if (typeof _scheduledAlertJob !== 'undefined')
		{
			_scheduledAlertJob.cancel();
			_scheduledAlertJob = undefined;
		}	

		if (typeof _scheduledWakeupJob !== 'undefined')
		{
			_scheduledWakeupJob.cancel();
			_scheduledWakeupJob	 = undefined;
		}
	}

	this.setWakeMethods = function (wakeMethods) {
		_wakeMethods = wakeMethods;
	}

	this.setAlertMethods = function (alertMethods) {
		_alertMethods = alertMethods;

		for (var recordNum in _alertMethods)
		{
			if (_alertMethods[recordNum].method == "indigo" )
			{
				this._refreshSyncState(_alertMethods[recordNum]);
				this._scheduleIndigoVariableRefresh(_alertMethods[recordNum]);
			}
			else if(alertMethods[recordNum].method == "sns")
			{
				// should be all good here, but leaving this frame in place.
			}
		}
	}

	this.setAlertDevice = function (alertDeviceName, alertOffNetworkTTL) {
		_alertDevice = alertOffNetworkTTL > 0;

		this.setWhiteListDevice(alertDeviceName);

		_alertDeviceName = alertDeviceName;
		_alertOffNetworkTTL = alertOffNetworkTTL;

		console.log("** (" + this._getCurrentTime() + ") Alert Device has been enabled for " + alertDeviceName);

		if (typeof(this.getDeviceState()) === 'undefined') {
			this._scheduleAlert(1);
		}
	}

	this.logToConsole = function() {
		console.log("\t***************** -- Device Details " + this._getCurrentTime() + " -- **************");
		console.log("\t\tTimestamp: " + _fingTimestamp);
		console.log("\t\tMac: " + this.getMACAddress());
		console.log("\t\tIP Address: " + this.getIPAddress());
		console.log("\t\tFQDN: " + this.getFQDN());
		console.log("\t\tState: " + this.getDeviceState());
		console.log("\t\tState Timestamp (fing): " + _fingTimestamp);

		if (typeof _configuration !== 'undefined') console.log("\t\tConfiguration set: true");
		else console.log("\t\tConfiguration set: false");

		console.log("\t\tis a Whitelisted device?: " + this.isWhiteListedDevice());
		console.log("\t\thas been reported?: " + _unknownDeviceReported);
		console.log("\t\tReported as a non-whitelisted Device Timestamp: " + _unknownDeviceReportedTimestamp);
		console.log("\t\tis a Alert Device?: " + this.isAlertDevice());

		if (this.isAlertDevice()) console.log("\t\tAlert Device Name: " + this.getAlertDeviceName());
		if (this.isAlertDevice()) console.log("\t\tScheduled refresh: " + _scheduledIndigoRefresh);
		if (this.isWhiteListedDevice()) console.log("\t\tWhite List Device Name: " + _whiteListDeviceName);

		console.log("\t\tScheduled Alert: " + _scheduledAlertDate);
		if (this.isAlertDevice()) console.log("\t\tSync'd Value: " + this.getSyncState());
		if (this.isAlertDevice()) console.log("\t\tSync Value Timestamp: " + _syncStateTimestamp);		
		console.log("\t******************************************************");		
	}

// **************************************************************************
// Private Functions

	this._reportUnknownDevice = function() {
		// if it was already reported, let's quit
		if (_unknownDeviceReported) return;

		var alertText = "ALERT ** Found a device that is not cleared to be on the network: " + mac + " FQDN: " + fqdn;

		console.log("** (" + this._getCurrentTime() + ") " + alertText);

		for (var recordNum in _configuration.data.UnknownDeviceNotification) {

			// create reusable transport method (opens pool of SMTP connections)
			var smtpTransport = nodemailer.createTransport("SMTP",{
				host: _configuration.data.EmailConfiguration.SMTP_Server, // hostname
				secureConnection: true, // use SSL
				port: 465, // port for secure SMTP			    
//			    auth: {
//			        user: "gmail.user@gmail.com",
//			        pass: "userpass"
//			    }
			});

			var emailBody = "";

			emailBody += "\t***************** -- Device Details " + this._getCurrentTime() + " -- **************";
			emailBody += "\t\tTimestamp: " + _fingTimestamp;
			emailBody += "\t\tMac: " + this.getMACAddress();
			emailBody += "\t\tIP Address: " + this.getIPAddress();
			emailBody += "\t\tFQDN: " + this.getFQDN();
			emailBody += "\t\tState: " + this.getDeviceState();
			emailBody += "\t\tState Timestamp (fing): " + _fingTimestamp;

			if (typeof _configuration !== 'undefined') emailBody += "\t\tConfiguration set: true";
			else emailBody += "\t\tConfiguration set: false";

			emailBody += "\t\tis a Whitelisted device?: " + this.isWhiteListedDevice();
			emailBody += "\t\thas been reported?: " + _unknownDeviceReported;
			emailBody += "\t\tReported as a non-whitelisted Device Timestamp: " + _unknownDeviceReportedTimestamp;
			emailBody += "\t\tis a Alert Device?: " + this.isAlertDevice();

			if (this.isAlertDevice()) emailBody += "\t\tAlert Device Name: " + this.getAlertDeviceName();
			if (this.isAlertDevice()) emailBody += "\t\tScheduled refresh: " + _scheduledIndigoRefresh;
			if (this.isWhiteListedDevice()) emailBody += "\t\tWhite List Device Name: " + _whiteListDeviceName;

			emailBody += "\t\tScheduled Alert: " + _scheduledAlertDate;
			if (this.isAlertDevice()) emailBody += "\t\tSync'd Value: " + this.getSyncState();
			if (this.isAlertDevice()) emailBody += "\t\tSync Value Timestamp: " + _syncStateTimestamp;		
			emailBody += "\t******************************************************";		

			// setup e-mail data with unicode symbols
			var mailOptions = {
				from: _configuration.data.EmailConfiguration.EmailFrom, // sender address
				to: _configuration.data.UnknownDeviceNotification[recordNum].address, // list of receivers
				subject: "Network Device Alert", // Subject line
				text: emailBody, // plaintext body
			}

			// send mail with defined transport object
			smtpTransport.sendMail(mailOptions, function(error, response){
				if(error){
					console.log(error);
				}else{
					console.log("Message sent: " + response.message);
				}

				// if you don't want to use this transport object anymore, uncomment following line
				smtpTransport.close(); // shut down the connection pool, no more messages
			});
		}

		_unknownDeviceReported = true;
		_unknownDeviceReportedTimestamp = this._getCurrentTime();
	}

//	the variable 'schedule' must be of type Date()
	this._scheduleAlert = function (addMinutes)
	{
		if (typeof _scheduledAlertJob !== 'undefined')
		{
			_scheduledAlertJob.cancel();
			_scheduledAlertJob = undefined;
		}

		if (typeof _scheduledWakeupJob !== 'undefined')
		{
			_scheduledWakeupJob.cancel();
			_scheduledWakeupJob = undefined;
		}

		_scheduledAlertDate = moment().add('m', addMinutes).format(_dateformat);

		if (_self._hasWakeupMethods()) {
			_scheduledWakeupDate = moment().format(_dateformat);

			if (addMinutes > 1) {
				_scheduledWakeupDate = moment().add('m', addMinutes - 1).format(_dateformat);
			}

			_scheduledWakeupJob = schedule.scheduleJob(_scheduledWakeupDate, function() {
				console.log("** (" + _self._getCurrentTime() + ") Running the scheduled job to wakeup for device " + _self.getAlertDeviceName());
				_self._scheduledWakeupJob = undefined;
				_self._scheduledWakeupDate = undefined;

				if (_self._hasWakeupMethods())
				{
					_self._wakeDevice();
				}
			});

			console.log("** (" + this._getCurrentTime() + ") A job has been scheduled to wake " + this.getAlertDeviceName() + " at: " + _scheduledWakeupDate);
		}

		_scheduledAlertJob = schedule.scheduleJob(_scheduledAlertDate, function() {
			console.log("** (" + _self._getCurrentTime() + ") Running the scheduled job to alert for device " + _self.getAlertDeviceName());
			_self._scheduledAlertJob = undefined;
			_self._scheduledAlertDate = undefined;

			if (_self._isReadyforAlert())
			{
				_self._alertDevice();
			}
		});

		console.log("** (" + this._getCurrentTime() + ") A job has been scheduled to announce " + this.getAlertDeviceName() + " at: " + _scheduledAlertDate);
	}

	this._hasWakeupMethods = function () {
		if (typeof(_wakeMethods) === 'undefined') return false;

		return (_wakeMethods.length > 0);
	}

	this._wakeDevice = function () {
		for (var method in _wakeMethods) {
			console.log("** (" + this._getCurrentTime() + ") About to try to wake device " + this.getAlertDeviceName() + " using " + _wakeMethods[method].method + ":");
			if (_wakeMethods[method].method == "pushover") {
				var p = new push( {
					user: _wakeMethods[method].user,
					token: _wakeMethods[method].token,
				});

				var msg = {
					message: 'Wakeup Message',
					title: "DeviceWatch.js wakeup message to refresh status on the home network",
					device: _wakeMethods[method].device,
					priority: _wakeMethods[method].priority
				};

				p.send(msg, function( err, result ) {
					if ( err ) {
						throw err;
					}
					console.log("** (" + _self._getCurrentTime() + ") Pushover publication result: " + result);
				});
			}
		}
	}

	this._scheduleIndigoVariableRefresh = function (alertMethod) {
		if (typeof _scheduledIndigoRefreshIntervalID !== 'undefined')
		{
			return;

			clearInterval(_scheduledIndigoRefreshIntervalID);
			_scheduledIndigoRefreshIntervalID = undefined;
			_scheduledIndigoRefresh = false;
		}

		if (this.isAlertDevice() && !_scheduledIndigoRefresh) {
			if (typeof _configuration !== 'undefined') {
				console.log("** (" + this._getCurrentTime() + ") About to schedule a refresh for the Indigo variable of " + this.getAlertDeviceName());
				_scheduledIndigoRefresh = true;

				_scheduledIndigoRefreshIntervalID = setInterval(function() {
					_self._refreshSyncState(alertMethod);
				}, _configuration.data.IndigoConfiguration.scanInterval * 1000 * 60);			
			}
		}
	}

	this._getRefreshSyncStateMechanism = function() {
		for (var recordNum in _alertMethods) {
			if (_alertMethods[recordNum].method == "indigo") {
				return _alertMethods[recordNum];
			}
		}

		return undefined;		
	}

	this.hasGetStateMechanism = function () {
		return (typeof (this._getRefreshSyncStateMechanism()) !== 'undefined');
	}

	this._isReadyforAlert = function () {
		// if it's not a device that needs to be announced (alert flag is false)	
		if (!this.isAlertDevice()) {
			return false;
		}

		if (typeof this.getSyncState() === 'undefined') {
			console.log("** (" + this._getCurrentTime() + ") No previous state is known about " + this.getAlertDeviceName() + ".  Going to schedule a alert in 1 minute.  Current state from fing is " + this.getDeviceState());
			if (this.hasGetStateMechanism()) {
				this._refreshSyncState(this._getRefreshSyncStateMechanism());
				this._scheduleAlert(1);

				return false;
			}

			return true;
		}

		console.log("** (" + this._getCurrentTime() + ") Sync state of " + this.getAlertDeviceName() + " is: " + this.getSyncState() + ", current state from fing is " + this.getDeviceState());

		if (!this.getSyncState() && this.getDeviceState())
		{
			console.log("** (" + this._getCurrentTime() + ") Will send an alert for device " + this.getAlertDeviceName() + " since the sync state is false and the device is online");

			return true;
		}
		else if (this.getDeviceState() == this.getSyncState())
		{
			console.log("** (" + this._getCurrentTime() + ") Not going to send an alert for device " + this.getAlertDeviceName() + " because the sync state and the current state are the same");
			return false;
		}
		else if (!this.getDeviceState() && (this._getCurrentTime() < this.getScheduledAlertDate())) {
			console.log("** (" + this._getCurrentTime() + ") Not going to send an alert for device " + this.getAlertDeviceName() + " because the expiration time has not passed (" + this.getScheduledAlertDate() + ")");
			
			this._scheduleAlert(_alertOffNetworkTTL);

			return false;
		}

		console.log("** (" + this._getCurrentTime() + ") Will send an alert for device " + this.getAlertDeviceName() + " because it did not meet any of the other conditions.");
		return true;
	}

	this._refreshSyncState = function(alertMethod) {
		var newIndigoValue = false;

		if (typeof(alertMethod) === 'undefined') {
			throw new Error("need a alertMethod passed in order to refresh Indigo.") 
			return;
		}
		if (alertMethod.method != 'indigo') {
			console.log("** (" + _self._getCurrentTime() + ") Odd, I should not be here since the alert method is not set to indigo.");
			return;
		}

		needle.get(alertMethod.indigoEndpoint + ".txt", function(err, resp, body) {
			csv()
			.from(body, { delimiter: ':', ltrim: 'true', rtrim: 'true' })
			.to.array( function(data, count) {
				console.log("** (" + _self._getCurrentTime() + ") Raw HTTP request results from Indigo: \n" + body);
				newIndigoValue = data[5][1] == "true";
				
				console.log("** (" + _self._getCurrentTime() + ") Obtained and saved the current value of indigo variable for " + _self.getAlertDeviceName() + " is: " + newIndigoValue);
				
				_syncState = newIndigoValue;
				_syncStateTimestamp = _self._getCurrentTime();
			})
			.on('error', function(error){
				console.log("** (" + _self._getCurrentTime() + ") Error getting results from Indigo: " + error.message);
			});				
		});		
	}

	this._alertDevice = function() {
		if (!this.isAlertDevice()) return;

		if (_configuration.data.FakePublish) {
			console.log("** (" + _self._getCurrentTime() + ") Not going to publish (see configuration) ");

			return;
		}

		if (typeof _configuration === 'undefined')
		{
			return;
		}

		var setValue = this.getDeviceState();

		if (typeof(setValue) === 'undefined') {
			setValue = false;
		}

		for (var recordNum in _alertMethods) {
			if (_alertMethods[recordNum].method == "indigo")
			{
				if (setValue)
				{
					setValue = "value=true";
				}
				else
				{
					setValue = "value=false";
				}

				console.log("** (" + this._getCurrentTime() + ") ALERT ** Alert being sent for device - " + this.getAlertDeviceName() + ": State is " + setValue);

				if (_configuration.data.IndigoConfiguration.passwordProtect)
				{
					needle.put(_alertMethods[recordNum].indigoEndpoint, setValue, { username: _configuration.data.IndigoConfiguration.username, password: _configuration.data.IndigoConfiguration.password, auth: 'digest' }, function() {
						//
					})
				}
				else
				{
					needle.put(_alertMethods[recordNum].indigoEndpoint, setValue, function() {
						//
					})
				}
			}
			else if (_alertMethods[recordNum].method == "sns")
			{
				_configuration.amazonSNSPublisher.publish(_alertMethods[recordNum].AWSTopicARN, this._prepare_SNS_Message(setValue));
			}
		}


		_syncState = this.getDeviceState();
	}
}

module.exports = NetworkDevice;