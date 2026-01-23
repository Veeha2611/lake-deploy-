#!/usr/bin/env bash

INTACCT_COMPANY_ID="GWI2-DEV"
INTACCT_SENDER_ID="GWI2"
INTACCT_SENDER_PASSWORD="W5FTLV2kkXJ67^"
INTACCT_WS_USER_ID="datalake"
INTACCT_WS_USER_PASSWORD="691TKY#QEJc"

REQUEST_XML="<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<request>
  <control>
    <senderid>${INTACCT_SENDER_ID}</senderid>
    <password>${INTACCT_SENDER_PASSWORD}</password>
    <controlid>test-glaccount-keys</controlid>
    <uniqueid>false</uniqueid>
    <dtdversion>3.0</dtdversion>
  </control>
  <operation>
    <authentication>
      <login>
        <userid>${INTACCT_WS_USER_ID}</userid>
        <companyid>${INTACCT_COMPANY_ID}</companyid>
        <password>${INTACCT_WS_USER_PASSWORD}</password>
      </login>
    </authentication>
    <content>
      <function controlid=\"glaccount_keys\">
        <readByQuery>
          <object>GLACCOUNT</object>
          <fields>RECORDNO</fields>
          <query>RECORDNO &gt; 0</query>
          <pagesize>1000</pagesize>
        </readByQuery>
      </function>
    </content>
  </operation>
</request>"

curl -s \
  -H "Content-Type: application/xml" \
  -d "${REQUEST_XML}" \
  "https://api.intacct.com/ia/xml/xmlgw.phtml" | xmllint --format - 2>/dev/null || curl -s \
  -H "Content-Type: application/xml" \
  -d "${REQUEST_XML}" \
  "https://api.intacct.com/ia/xml/xmlgw.phtml"
