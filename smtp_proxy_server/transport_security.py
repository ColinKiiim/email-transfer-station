def validate_transport(protocol, cert, key, allow_insecure_auth):
    if bool(cert) != bool(key):
        raise ValueError(
            f"Both {protocol}_tls_cert and {protocol}_tls_key must be set together"
        )
    if not cert and not allow_insecure_auth:
        raise ValueError(f"{protocol.upper()} authentication requires TLS")
    return bool(cert)
