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
	var _sns_topicARN = new Array();

	this.setCredentials = function(indigoUserName, indigoPassword) {
		_indigoUserName = indigoUserName;
		_indigoPassword = indigoPassword;
		if (typeof _indigoPassword === 'undefined') _isPasswordProtected = false;
		else _isPasswordProtected = _indigoPassword.length > 0;		
	}

	this.addSNSTopic = function (topicARN)
	{
		_sns_topicARN[_sns_topicARN.length] = topicARN;
	}

	this.getSNSTopics = function() {
		return _sns_topicARN;
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

	this.isSNSEnabled = function() {
		return (_aws && _sns_topicARN.length > 0)
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

	this.setAmazonCredentials = function(accessKey, secretKey) {
		_aws_accessKey = accessKey;
		_aws_secretKey = secretKey;
		if (typeof _aws_secretKey === 'undefined') _aws = false;
		else _aws = _aws_secretKey.length > 0;
	}
}

module.exports = Configuration;