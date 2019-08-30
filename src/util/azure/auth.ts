/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { interactiveLoginWithAuthResponse, DeviceTokenCredentials, AuthResponse } from '@azure/ms-rest-nodeauth';
import { MemoryCache } from 'adal-node';
import { Environment } from '@azure/ms-rest-azure-env';
import Conf from 'conf';
import { Logger } from '../shared/types';

const AUTH = 'auth';

export const globalConfig = new Conf<string | AuthResponse | null>({
  defaults: {
    auth: null
  },
  configName: 'ng-azure'
});

export async function clearCreds() {
  return globalConfig.set(AUTH, null);
}

export async function loginToAzure(logger: Logger): Promise<AuthResponse> {
  // a retry login helper function
  const retryLogin = async (_auth: AuthResponse | null) => {
    if (_auth === null) {
      return null;
    }
    _auth = await interactiveLoginWithAuthResponse();
    _auth.credentials = _auth.credentials as DeviceTokenCredentials;
    globalConfig.set(AUTH, _auth);
    return _auth;
  };

  // check old AUTH config from cache
  let auth = (await globalConfig.get(AUTH)) as AuthResponse | null;

  // if old AUTH config is not found, we trigger a new login flow
  if (auth === null) {
    auth = await retryLogin(auth);
  } else {
    const creds = auth.credentials as DeviceTokenCredentials;
    const { clientId, domain, username, tokenAudience, environment } = creds;

    // if old AUTH config was found, we extract and check if the required fields are valid
    if (creds && clientId && domain && username && tokenAudience && environment) {
      const cache = new MemoryCache();
      cache.add(creds.tokenCache._entries, () => {});

      auth.credentials = new DeviceTokenCredentials(
        clientId,
        domain,
        username,
        tokenAudience,
        new Environment(environment),
        cache
      );

      const token = await creds.getToken();

      // if extracted token has expiredm, we request a new login flow
      if (new Date(token.expiresOn).getTime() < Date.now()) {
        logger.info(`Your stored credentials have expired; you'll have to log in again`);

        auth = await retryLogin(auth);
      }
    } else {
      // if old AUTH config was found, but the required fields are NOT valid, we trigger a new login flow
      auth = await retryLogin(auth);
    }
  }

  return auth as AuthResponse;
}
