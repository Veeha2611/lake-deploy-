import os
import uuid
import datetime as dt
from typing import Optional
import requests
from xml.etree import ElementTree as ET


class IntacctClientError(Exception):
    """Generic Intacct client error."""

    def __init__(self, message: str, response: Optional[ET.Element] = None) -> None:
        super().__init__(message)
        self.response = response


class IntacctClient:
    """
    Thin Intacct XML Gateway client that:
    - Reads all credentials from environment variables
    - Sends XML payloads to the Intacct endpoint
    """

    def __init__(
        self,
        endpoint_url: Optional[str] = None,
        sender_id: Optional[str] = None,
        sender_REDACTED = None,
        company_id: Optional[str] = None,
        user_id: Optional[str] = None,
        user_REDACTED = None,
        timeout_seconds: Optional[int] = None,
    ) -> None:
        self.endpoint_url = endpoint_url or os.environ.get("INTACCT_ENDPOINT_URL")
        self.sender_id = sender_id or os.environ.get("INTACCT_SENDER_ID")
        self.sender_REDACTED or os.environ.get("INTACCT_SENDER_PASSWORD")
        self.company_id = company_id or os.environ.get("INTACCT_COMPANY_ID")
        self.user_id = user_id or os.environ.get("INTACCT_WS_USER_ID")
        self.user_REDACTED or os.environ.get("INTACCT_WS_USER_PASSWORD")
        self.timeout_seconds = timeout_seconds or 60

        missing = [
            name
            for name, value in [
                ("INTACCT_ENDPOINT_URL", self.endpoint_url),
                ("INTACCT_SENDER_ID", self.sender_id),
                ("INTACCT_SENDER_PASSWORD", self.sender_password),
                ("INTACCT_COMPANY_ID", self.company_id),
                ("INTACCT_WS_USER_ID", self.user_id),
                ("INTACCT_WS_USER_PASSWORD", self.user_password),
            ]
            if not value
        ]
        if missing:
            raise IntacctClientError(f"Missing required Intacct env vars: {', '.join(missing)}")

    # ---------- XML helpers ---------- #

    def _build_request_xml(self, function_xml: str) -> str:
        """
        Wrap a <function>...</function> XML fragment in the full Intacct request envelope.
        """
        control_id = f"req-{uuid.uuid4()}"
        dttm = dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S")

        # NOTE: We build this as a simple formatted string for now.
        # If you want, we can switch to ElementTree building everywhere later.
        xml = f"""<?xml version="1.0" encoding="utf-8"?>
<request>
  <control>
    <senderid>{self.sender_id}</senderid>
    <password>{self.sender_password}</password>
    <controlid>{control_id}</controlid>
    <uniqueid>true</uniqueid>
    <dtdversion>3.0</dtdversion>
    <includewhitespace>false</includewhitespace>
  </control>
  <operation>
    <authentication>
      <login>
        <userid>{self.user_id}</userid>
        <companyid>{self.company_id}</companyid>
        <password>{self.user_password}</password>
        <locationid></locationid>
      </login>
    </authentication>
    <content>
      <function controlid="{control_id}">
        {function_xml}
      </function>
    </content>
  </operation>
</request>
"""
        return xml

    def _post_xml(self, xml_body: str) -> ET.Element:
        """
        Send XML to Intacct and return the root Element of the parsed response.
        Raises IntacctClientError on HTTP or XML-level error.
        """
        headers = {
            "Content-Type": "application/xml; charset=utf-8",
            "Accept": "application/xml",
        }

        resp = requests.post(
            self.endpoint_url,
            data=xml_body.encode("utf-8"),
            headers=headers,
            timeout=self.timeout_seconds,
        )
        if resp.status_code != 200:
            raise IntacctClientError(
                f"HTTP error from Intacct: {resp.status_code} {resp.text[:300]!r}"
            )

        try:
            root = ET.fromstring(resp.text)
        except ET.ParseError as e:
            raise IntacctClientError(f"Failed to parse Intacct XML response: {e}\nBody: {resp.text[:300]!r}")

        # Intacct errors are reported in <errormessage> tags
        error_nodes = root.findall(".//errormessage")
        if error_nodes:
            messages = []
            for em in error_nodes:
                for msg in em.findall(".//description2"):
                    if msg.text and msg.text.strip():
                        messages.append(msg.text.strip())
            raise IntacctClientError(
                f"Intacct returned errors: {' | '.join(messages)}",
                response=root,
            )

        return root

    # ---------- Example API methods ---------- #

    def get_gl_accounts(self, min_recordno: int = 0) -> ET.Element:
        """
        Read GL accounts using readByQuery with a simple text query expression.

        In this Intacct org, <query> expects a simple string expression, not
        nested XML filter elements, so we use:
            <query>RECORDNO > '0'</query>
        by default.
        """
        # Build a simple query string
        query_expr = f"RECORDNO > '{min_recordno}'"

        function_xml = f"""
        <readByQuery>
          <object>GLACCOUNT</object>
          <fields>*</fields>
          <query>{query_expr}</query>
          <pagesize>1000</pagesize>
        </readByQuery>
        """
        request_xml = self._build_request_xml(function_xml)
        return self._post_xml(request_xml)

    def get_customers(self) -> ET.Element:
        """
        Example: read AR customers.
        """
        function_xml = """
        <readByQuery>
          <object>CUSTOMER</object>
          <fields>*</fields>
          <query></query>
          <pagesize>1000</pagesize>
        </readByQuery>
        """
        request_xml = self._build_request_xml(function_xml)
        return self._post_xml(request_xml)


def _demo() -> None:
    """
    Simple demo that:
    - Instantiates the client from env vars
    - Calls get_gl_accounts()
    - Prints how many GL accounts came back
    """
    client = IntacctClient()
    root = client.get_gl_accounts()

    # Example: count records in the response
    records = root.findall(".//data//GLACCOUNT")
    print(f"Retrieved {len(records)} GLACCOUNT records from Intacct.")


if __name__ == "__main__":
    _demo()
