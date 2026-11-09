// These functions are serialized into Workbox; keep them self-contained.
export const appShellNavigationAllowlist = [/^\/(?:index\.html)?(?:\?.*)?$/];

export function publicImageMatch({ url, sameOrigin, request }) {
  return (
    sameOrigin &&
    request.method === 'GET' &&
    !request.headers.has('authorization') &&
    url.pathname.startsWith('/static/') &&
    /\.(png|jpg|jpeg|svg|gif|webp)$/.test(url.pathname)
  );
}

export function publicFontMatch({ url, sameOrigin, request }) {
  return (
    sameOrigin &&
    request.method === 'GET' &&
    !request.headers.has('authorization') &&
    url.pathname.startsWith('/static/') &&
    /\.(woff|woff2|ttf|eot)$/.test(url.pathname)
  );
}
