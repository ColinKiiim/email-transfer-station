import json
import logging

import httpx
from twisted.mail import imap4
from zope.interface import implementer
from twisted.cred.portal import Portal, IRealm
from twisted.internet import protocol, reactor, defer, ssl, threads
from twisted.cred import error as cred_error
from twisted.cred.checkers import ICredentialsChecker, IUsernamePassword

from config import settings
from imap_http_client import BackendClient
from imap_mailbox import SimpleMailbox

_logger = logging.getLogger(__name__)
_logger.setLevel(logging.INFO)


class SimpleIMAPServer(imap4.IMAP4Server):
    def __init__(self, context_factory=None):
        chal = {
            b"LOGIN": imap4.LOGINCredentials,
            b"PLAIN": imap4.PLAINCredentials,
        }
        imap4.IMAP4Server.__init__(
            self, chal=chal, contextFactory=context_factory
        )
        self._ets_tls_required = context_factory is not None

    def do_AUTHENTICATE(self, tag, args):
        if self._ets_tls_required and not self.startedTLS:
            self.sendBadResponse(tag, b"AUTHENTICATE is disabled before STARTTLS")
            return
        return super().do_AUTHENTICATE(tag, args)

    def _cbSelectWork(self, mbox, cmdName, tag):
        """Override to add UIDNEXT in SELECT response (RFC 3501)."""
        if mbox is None:
            self.sendNegativeResponse(tag, b"No such mailbox")
            return
        if "\\noselect" in [s.lower() for s in mbox.getFlags()]:
            self.sendNegativeResponse(tag, "Mailbox cannot be selected")
            return

        flags = [imap4.networkString(flag) for flag in mbox.getFlags()]
        self.sendUntaggedResponse(b"%d EXISTS" % (mbox.getMessageCount(),))
        self.sendUntaggedResponse(b"%d RECENT" % (mbox.getRecentCount(),))
        self.sendUntaggedResponse(b"FLAGS (" + b" ".join(flags) + b")")
        self.sendPositiveResponse(
            None, b"[UIDVALIDITY %d]" % (mbox.getUIDValidity(),)
        )
        self.sendPositiveResponse(
            None, b"[UIDNEXT %d]" % (mbox.getUIDNext(),)
        )

        s = mbox.isWriteable() and b"READ-WRITE" or b"READ-ONLY"
        mbox.addListener(self)
        self.sendPositiveResponse(
            tag, b"[" + s + b"] " + cmdName + b" successful"
        )
        self.state = "select"
        self.mbox = mbox


class Account(imap4.MemoryAccount):
    """Custom account that initializes mailbox UID index on select."""

    def _emptyMailbox(self, name, id):
        """Return a dummy mailbox for CREATE requests (e.g. Gmail creating Drafts)."""
        _logger.debug("Accepting CREATE request for %s", name)
        return SimpleMailbox(name, self._client)

    def create(self, pathspec):
        """Accept CREATE silently without actually creating mailboxes."""
        _logger.debug("Ignoring CREATE for %s", pathspec)
        return True

    def listMailboxes(self, ref, wildcard):
        """Only list INBOX and SENT, ignore client-created mailboxes."""
        return [("INBOX", self.mailboxes["INBOX"]), ("SENT", self.mailboxes["SENT"])]

    @defer.inlineCallbacks
    def select(self, name, readwrite=1):
        mbox = self.mailboxes.get(imap4._parseMbox(name.upper()))
        if mbox is not None:
            yield mbox._build_uid_index()
        return mbox


@implementer(IRealm)
class SimpleRealm:
    def requestAvatar(self, avatarId, mind, *interfaces):
        res = json.loads(avatarId)
        username = res["username"]
        password = res["password"]

        client = BackendClient(password)

        inbox = SimpleMailbox("INBOX", client)
        sent = SimpleMailbox("SENT", client)

        account = Account(username)
        account._client = client
        account.mailboxes = {"INBOX": inbox, "SENT": sent}
        account.subscriptions = ["INBOX", "SENT"]

        return imap4.IAccount, account, lambda: client.close()


class IMAPFactory(protocol.Factory):
    def __init__(self, portal, context_factory=None):
        self.portal = portal
        self._context_factory = context_factory

    def buildProtocol(self, addr):
        p = SimpleIMAPServer(context_factory=self._context_factory)
        p.portal = self.portal
        return p


@implementer(ICredentialsChecker)
class CustomChecker:
    credentialInterfaces = (IUsernamePassword,)

    @staticmethod
    def _is_jwt(token: str) -> bool:
        """Check if token looks like a JWT (eyJ... with 3 dot-separated parts)."""
        parts = token.split(".")
        return len(parts) == 3 and parts[0].startswith("eyJ")

    def requestAvatarId(self, credentials):
        username = credentials.username.decode()
        password = credentials.password.decode()

        if self._is_jwt(password):
            _logger.info("Login via JWT token")
            return defer.succeed(json.dumps({
                "username": username,
                "password": password,
            }))

        # Not a JWT — try address+password login via backend
        _logger.info("Login via address+password")
        d = threads.deferToThread(self._login_with_password, username, password)
        return d

    @staticmethod
    def _login_with_password(username: str, password: str) -> str:
        """Exchange address+password for a JWT via backend."""
        res = httpx.post(
            f"{settings.proxy_url}/api/address_login",
            json={
                "email": username,
                "password": password,
                "password_format": "plain",
            },
            headers={
                "x-custom-auth": settings.basic_password,
                "Content-Type": "application/json",
            },
            timeout=settings.imap_http_timeout,
        )
        if res.status_code == 200:
            jwt = res.json().get("jwt")
            if jwt:
                return json.dumps({
                    "username": username,
                    "password": jwt,
                })
        raise cred_error.UnauthorizedLogin(f"address_login failed: {res.status_code}")


def start_imap_server():
    _logger.info("Starting IMAP server on port %s", settings.imap_port)

    context_factory = None
    has_tls = settings.validate_transport("imap")
    if has_tls:
        _logger.info("TLS enabled for IMAP (STARTTLS)")
        context_factory = ssl.DefaultOpenSSLContextFactory(
            settings.imap_tls_key,
            settings.imap_tls_cert,
        )

    portal = Portal(SimpleRealm(), [CustomChecker()])
    factory = IMAPFactory(portal, context_factory=context_factory)
    reactor.listenTCP(settings.imap_port, factory, interface=settings.bind_host)
    reactor.run()


if __name__ == "__main__":
    _logger.info(
        "Starting IMAP server proxy_url=%s port=%s tls=%s",
        settings.proxy_url, settings.imap_port,
        bool(settings.imap_tls_cert and settings.imap_tls_key),
    )
    start_imap_server()
