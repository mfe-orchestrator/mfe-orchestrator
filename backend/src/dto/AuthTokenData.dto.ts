export interface AuthTokenDataDTO {
  accessToken: string;
  tokenPayload: {
    id: string;
    email: string;
    role: string;
    iss: string;
  };
}
