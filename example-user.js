// conforms to <https://tools.ietf.org/html/draft-smarr-vcarddav-portable-contacts-00>
// according to <http://www.passportjs.org/docs/>
// TODO: implement contact schema
user = {
    provider: 'local',
    id: '<not assigned by provider yet>',
    displayName: 'Name',
    name: {
        familyName: 'Last',
        givenName: 'First',
        middleName: 'Middle'
    },
    emails: [
        {
            value: 'example@example.com',
            type: 'home'
        }
    ],
    photos: [
        value: '<no image url yet>'
    ]
};
