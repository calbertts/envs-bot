const AWS = require('aws-sdk')
const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const _ = require('lodash')
const dynamoose = require('dynamoose')
const app = express()

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

AWS.config.update({region: 'eu-west-1'});
const Envs = dynamoose.model('envs_bot', { env: String, project: String, user: String })

const isAdmin = (from) => from.mention_name === 'CarlosAlbertoCastaño' || from.mention_name === 'GeronimoDiPierro'
const getUserName = (from) => from.name
const getAction = (message = '') => _.get(message.split(' '), '[1]', '').trim()
const getEnvironment = (message = '') => _.get(message.split(' '), '[2]', '').trim()

const getDBEnvValues = async () => {
    const envsList = await Envs.scan().exec()
    return envsList
}

app.post('/user-message', async (req, res) => {
    const {message, from} = req.body.item.message

    const action = getAction(message)
    let respMessage = ''

    if (action === 'add') {
        const environmentName = getEnvironment(message).toUpperCase()
        const environmentObj = new Envs({env: environmentName, project: 'MFO', user: null});

        await environmentObj.save()

        respMessage = 'Añadido!'
    }

    else if (action === 'remove' && isAdmin(from)) {
        const environmentName = getEnvironment(message).toUpperCase()
        const environmentObj = new Envs({env: environmentName, project: 'MFO', user: null});

        await environmentObj.delete({env: environmentName})

        respMessage = 'Eliminado!'
    }

    else if (action === 'free') {
        const userName = getUserName(from)
        const environment = getEnvironment(message).toUpperCase()
        const envsList = _.mapValues(_.groupBy(await getDBEnvValues(), 'env'), (item) => item[0])

        if (_.isEmpty(environment) || !Object.keys(envsList).includes(environment)) {
            respMessage = `Hey! los entornos son ${Object.keys(envsList).join(', ')}`
        }

        else if (envsList[environment].user !== userName && !isAdmin(from)) {
            respMessage = `Hey ${userName}!, se que no estás usando ${environment}, ${_.isEmpty(envsList[environment].user) ? 'no lo está usando nadie' : `lo está usando ${envsList[environment].user}`}`
        }

        else if (_.isEmpty(envsList[environment].user)) {
            respMessage = `${environment} ya estaba disponible, (-_-)!`
        }

        else {
            await Envs.update({env: environment}, {user: null})
            respMessage = `Gracias por avisar! ${environment} ahora está disponible para otra persona!`
        }
    }

    else if (action === 'use') {
        const userName = getUserName(from)
        const environment = getEnvironment(message).toUpperCase()
        const envsList = _.mapValues(_.groupBy(await getDBEnvValues(), 'env'), (item) => item[0])

        if (_.isEmpty(environment) || !Object.keys(envsList).includes(environment)) {
            respMessage = `Hey! los entornos son ${Object.keys(envsList).join(', ')}`
        }

        else if (!_.isEmpty(envsList[environment].user)) {
            if (envsList[environment].user === userName) {
                respMessage = `Pero si lo estás usando tu! ??`
            } else {
                respMessage = `No tan rápido ${userName}!, el entorno ${environment} está siendo usado por ${envsList[environment].user}`
            }
        }

        else {
            await Envs.update({env: environment}, {user: userName})
            respMessage = `${environment} está disponible! úsalo, pero avísame cuando ya no lo necesites con /env free ${environment}`
        }
    }

    else {
        const envsList = await getDBEnvValues()
        const envsListStr = envsList.map(envData => `<li><b>${envData.env}</b>: ${envData.user ? envData.user : '<i>Disponible</i>'}</li>`).join('')

        respMessage = `Lista actual de entornos:
        <br/>
        <ul>
            ${envsListStr}
        </ul>
        <pre>/env            // Muestra esta información
/env add ENV    // Agrega un entorno
/env remove ENV // Elimina un entorno
/env use ENV    // Para usar un entorno
/env free ENV   // Para liberar un entorno</pre><br/>`
    }

    const url = 'https://optivamedia.hipchat.com/v2/room/4624043/notification?auth_token=Y8Xt4ilMEtTo7x7DlqvAUualOmNPsi414kAAZhOg'
    request.post(url, {
        form: {
            color: "green",
            message: respMessage,
            notify: true
        }
    })
});

module.exports = app;
