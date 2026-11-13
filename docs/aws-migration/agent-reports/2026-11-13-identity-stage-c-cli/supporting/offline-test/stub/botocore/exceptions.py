class ClientError(Exception):
    def __init__(self, code, message="FAKESECRET-in-error-message"):
        super().__init__(message)
        self.response = {"Error": {"Code": code, "Message": message}}
