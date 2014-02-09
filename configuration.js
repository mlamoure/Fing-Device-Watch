function Configuration () {
	var _isPasswordProtected;
	var _indigoPassword;
	var _indigoUserName;
	var _ip;
	var _port;
	var _variableRefreshRate = 5 * 60 * 1000;
	var _aws = false;
	var _sns = false;
	var _aws_accessKey;
	var _aws_secretKey;
	var _fakePublish;
	var _unknownDeviceNotification;

	this.publishEnabled = function () {
		return (!_fakePublish);
	}

	this.setFakePublish = function(fakePublish) {
		_fakePublish = fakePublish;
	}

	this.setCredentials = function(indigoUserName, indigoPassword) {
		_indigoUserName = indigoUserName;
		_indigoPassword = indigoPassword;
		if (typeof _indigoPassword === 'undefined') _isPasswordProtected = false;
		else _isPasswordProtected = _indigoPassword.length > 0;		
	}

	this.setPasswordProtectFlag = function(isPasswordProtected)
	{
		_isPasswordProtected = isPasswordProtected;
	}

	this.setIndigoUserName = function(indigoUserName) {
		this.setCredentials(indigoUserName, _indigoPassword);
	}

	this.setIndigoPassword = function(indigoPassword) {
		this.setCredentials(_indigoUserName, indigoPassword);
	}

	this.isPasswordProtected = function() {
		return _isPasswordProtected;
	}

	this.getIndigoPassword = function () {
		return _indigoPassword;
	}

	this.getIndigoUserName = function () {
		return _indigoUserName;
	}

	this.getAccessKey = function() {
		return _aws_accessKey;
	}

	this.getSecretKey = function() {
		return _aws_secretKey;
	}

	this.getIndigoVariableRefreshRate = function () {
		return _variableRefreshRate;
	}

	this.setIndigoVariableRefreshRate = function(interval) {
		_variableRefreshRate = interval * 60 * 1000;
	}

	this.setAWS_AccessKey = function(accessKey)
	{
		this.setAmazonCredentials(accessKey, _aws_secretKey);
	}

	this.setAWS_SecretKey = function(secretKey)
	{
		this.setAmazonCredentials(_aws_accessKey, secretKey);
	}

	this.isAWSEnabled = function() {
		return _aws;
	}

	this.getUnknownDeviceNotification = function() {
		return _unknownDeviceNotification;
	}

	this.setUnknownDeviceNotification = function(unknownDeviceNotification) {
		_unknownDeviceNotification = unknownDeviceNotification;
	}

	this.setAmazonCredentials = function(accessKey, secretKey) {
		_aws_accessKey = accessKey;
		_aws_secretKey = secretKey;
		if (typeof _aws_secretKey === 'undefined') _aws = false;
		else if (typeof _aws_accessKey === 'undefined') _aws = false;
		else _aws = _aws_secretKey.length > 0 && _aws_accessKey.length > 0;
	}
}

module.exports = Configuration;