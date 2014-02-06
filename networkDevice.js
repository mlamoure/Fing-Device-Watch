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
		_moment = require('moment'),
		_spawn = require('child_process').spawn,
		_exec = require('child_process').exec,
		_aws = require('aws-sdk'),
		_util = require('util'),
		_AWS_SNS,
		_schedule = require('node-schedule'),
		Configuration = require("./configuration.js"),
		_csv = require('csv'),
		_configuration,
		_dateformat = "YYYY/MM/DD HH:mm:ss",
		_needle = require('needle'),
		_mac = mac || 'none',
		_state,
		_previousState,
		_ip = ip || 'none',
		_manufacturer,
		_fingTimestamp,
		_fqdn = fqdn || 'none',
		_alertEmailList;

	this._getCurrentTime = function () {
		return (_moment().format(_dateformat));
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

	this.setIPAddress = function(ip) {
		_ip = ip;
	}

	this.setDeviceState = function (state) {
		previousState = _state;

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
		}

		_state = state;
		_fingTimestamp = this._getCurrentTime();

		// White List Device Stuff
		if (this._isReadyforWhiteListAlert())
		{
			this._reportUnknownDevice(_alertEmailList);
		}

		if (this._isReadyforAlert())
		{
			this._alertDevice();
		}
	}

	this._prepare_SNS_Message = function() {
		var object = { mac: this.getMACAddress(), state: this.getDeviceState(), timestamp: this._getCurrentTime() };
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

	this.setAlertEmailList = function (alertEmailList)
	{
		_alertEmailList = alertEmailList;
	}

	this.setConfiguration = function (configuration) {
		if (typeof _configuration === 'undefined') console.log("** (" + this._getCurrentTime() + ") Configuration for " + this.getMACAddress() + " is being set");

		_configuration = configuration;

		if (_configuration.isSNSEnabled())
		{
			// configure AWS 
			_aws.config.update({
				'region': 'us-east-1',
			    'accessKeyId': _configuration.getAccessKey(),
			    'secretAccessKey': _configuration.getSecretKey()
			});

			_AWS_SNS = new _aws.SNS().client;
		}
		
		this._scheduleIndigoVariableRefresh();
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
		_indigoState,
		_indigoStateTimestamp,
		_scheduledIndigoRefresh = false,
		_scheduledIndigoRefreshIntervalID;

	this.getScheduledAlertDate = function () {
		return _scheduledAlertDate;
	}

	this.getAlertDeviceName = function () {
		if (typeof _alertDeviceName === 'undefined') return this.getMACAddress();
		if (_alertDeviceName.length == 0) return this.getMACAddress();
		return _alertDeviceName;
	}

	this.isAlertDevice = function () {
		return _alertDevice;
	}

	this.getIndigoState = function () {
		return _indigoState;
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
		var recheckWhiteListStatus = _moment().add('m', addMinutes).format(_dateformat);

		_whiteListCheckJob = _schedule.scheduleJob(recheckWhiteListStatus, function() {
			console.log("** (" + _self._getCurrentTime() + ") Checking (via Scheduled) whitelist status for " + _self.getMACAddress());

			// White List Device Stuff
			if (_self._isReadyforWhiteListAlert())
			{
				_self._reportUnknownDevice(_alertEmailList);
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
	}

	this.setAlertDevice = function (alertDeviceName, alertMode, alertModeVariable, alertOffNetworkTTL) {
		_alertDevice = alertMode.length > 0;

		this.setWhiteListDevice(alertDeviceName);

		_alertDeviceName = alertDeviceName;
		_alertMode = alertMode;
		_alertIndigoVariableURL = alertModeVariable;
		_alertOffNetworkTTL = alertOffNetworkTTL;

		console.log("** (" + this._getCurrentTime() + ") Alert Device has been enabled for " + alertDeviceName);

		this._refreshIndigoState();

		this._scheduleIndigoVariableRefresh();
	}

	this.logToConsole = function() {
		console.log("\t***************** -- Device Details " + this._getCurrentTime() + " -- **************");
		console.log("\t\tTimestamp: " + _fingTimestamp);
		console.log("\t\tMac: " + this.getMACAddress());
		console.log("\t\tIP Address: " + this.getIPAddress());
		console.log("\t\tFQDN: " + this.getFQDN());
		console.log("\t\tState: " + this.getDeviceState());
		console.log("\t\tPrevious State: " + _previousState);
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
		if (this.isAlertDevice()) console.log("\t\tCached Indigo Value: " + this.getIndigoState());
		if (this.isAlertDevice()) console.log("\t\tIndigo Value Timestamp: " + _indigoStateTimestamp);		
		console.log("\t******************************************************");		
	}

// **************************************************************************
// Private Functions

	this._reportUnknownDevice = function(emails) {
		// if it was already reported, let's quit
		if (_unknownDeviceReported) return;

		var alertText = "ALERT ** Found a device that is not cleared to be on the network: " + mac + " FQDN: " + fqdn;


		console.log("** (" + this._getCurrentTime() + ") " + alertText);
		for (var i=0; i < emails.length; i++)
		{
		    _exec("echo \"" + alertText + "\" | mail -s \"Network Device Alert\" " + emails[i].address, function(error, stdout, stderr)
		    	{
		    		console.log(stdout); 
		    	});
		}

		_unknownDeviceReported = true;
		_unknownDeviceReportedTimestamp = this._getCurrentTime();
	}

//	the variable 'schedule' must be of type Date()
	this._scheduleAlert = function (addMinutes)
	{
		if (typeof _scheduledAlertJob === 'undefined')
		{
			_scheduledAlertDate = _moment().add('m', addMinutes).format(_dateformat);

			var schedule = new Date(
				_moment(_scheduledAlertDate, _dateformat).year(), 
				_moment(_scheduledAlertDate, _dateformat).month(), 
				_moment(_scheduledAlertDate, _dateformat).date(), 
				_moment(_scheduledAlertDate, _dateformat).hour(), 
				_moment(_scheduledAlertDate, _dateformat).minute(), 
				_moment(_scheduledAlertDate, _dateformat).seconds() + 1
			);

			_scheduledAlertJob = _schedule.scheduleJob(schedule, function() {
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
	}

	this._scheduleIndigoVariableRefresh = function () {
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
					_self._refreshIndigoState();
		        }, _configuration.getIndigoVariableRefreshRate());			
			}
		}
	}

	this._isReadyforAlert = function () {
		// if it's not a device that needs to be announced (alert flag is false)	
		if (!this.isAlertDevice()) {
			return false;
		}

		if (typeof this.getIndigoState() === 'undefined') {
			this._refreshIndigoState();

			console.log("** (" + this._getCurrentTime() + ") No current state is known about the Indigo value of " + this.getAlertDeviceName() + ", current state from fing is " + this.getDeviceState());

			this._scheduleAlert(1);

			return false;
		}

		console.log("** (" + this._getCurrentTime() + ") Cached Indigo value of " + this.getAlertDeviceName() + " is: " + this.getIndigoState() + ", current state from fing is " + this.getDeviceState());

		if (!this.getIndigoState() && this.getDeviceState())
		{
			console.log("** (" + this._getCurrentTime() + ") Will send an alert for device " + this.getAlertDeviceName() + " since Indigo state is false and the device is online");

			return true;
		}
		else if (this.getDeviceState() == this.getIndigoState())
		{
			console.log("** (" + this._getCurrentTime() + ") Not going to send an alert for device " + this.getAlertDeviceName() + " because Indigo is already set appropriately");
			return false;
		}
		else if (!this.getDeviceState() && (this._getCurrentTime() < this.getScheduledAlertDate())) {
			console.log("** (" + this._getCurrentTime() + ") Not going to send an alert for device " + this.getAlertDeviceName() + " because the expiration time has not passed (" + this.getScheduledAlertDate() + ")");
			
			this._scheduleAlert(_alertOffNetworkTTL);

			return false;
		}

		console.log("** (" + this._getCurrentTime() + ") Will send an alert for device " + this.getAlertDeviceName());
		return true;		
	}

	this._refreshIndigoState = function() {
		var newIndigoValue = false;

		_needle.get(_alertIndigoVariableURL + ".txt", function(err, resp, body) {
			_csv()
			.from(body, { delimiter: ':', ltrim: 'true', rtrim: 'true' })
			.to.array( function(data, count) {
				console.log("** (" + _self._getCurrentTime() + ") Raw HTTP request results from Indigo: \n" + body);
				newIndigoValue = data[5][1] == "true";
				
				console.log("** (" + _self._getCurrentTime() + ") Obtained and saved the current value of indigo variable for " + _self.getAlertDeviceName() + " is: " + newIndigoValue);
				
				_indigoState = newIndigoValue;
				_indigoStateTimestamp = _self._getCurrentTime();
			})
			.on('error', function(error){
				console.log("** (" + _self._getCurrentTime() + ") Error getting results from Indigo: " + error.message);
			});				
		});		
	}

	this._publish_sns = function(message) {
		console.log("** (" + this._getCurrentTime() + ") About to publish a SNS message for device " + this.getAlertDeviceName() + " message: " + message);

		if (!_configuration.isSNSEnabled()) return;

		_AWS_SNS.publish({
		    'TopicArn': _configuration.getSNSTopics()[0],
		    'Message': message,
		}, function (err, result) {
		 
			if (err !== null) {
				console.log("** (" + _self._getCurrentTime() + ") Sent a message and Amazon responded with an Error: " + _util.inspect(err));
				return;
		    }
			
			console.log("** (" + _self._getCurrentTime() + ") Sent a message and Amazon responded with: ");
			console.log(result);
		});
	}

	this._alertDevice = function() {
		if (!this.isAlertDevice()) return;

		if (!_configuration.publishEnabled()) {
			console.log("** (" + _self._getCurrentTime() + ") Not going to publish (see configuration) ");

			return;
		}

		if (typeof _configuration !== 'undefined')
		{
			if (_previousState != this.getDeviceState())
			{
				this._publish_sns(this._prepare_SNS_Message());			
			}			
		}

		var setValue;

		if (this.getDeviceState())
		{
			setValue = "value=true";
		}
		else
		{
			setValue = "value=false";
		}

		console.log("** (" + this._getCurrentTime() + ") ALERT ** Alert being sent for device - " + this.getAlertDeviceName() + ": State is " + setValue);

		if (_configuration.isPasswordProtected())
		{
			_needle.put(_alertIndigoVariableURL, setValue, { username: _configuration.getIndigoUserName(), password: _configuration.getIndigoPassword(), auth: 'digest' }, function() {
				//
			})
		}
		else
		{
			_needle.put(_alertIndigoVariableURL, setValue, function() {
				//
			})
		}

		_indigoState = this.getDeviceState();
	}
}

module.exports = NetworkDevice;