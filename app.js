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

const isAdmin = (name) => name === 'paola.cucurullo' || name === 'carlos.castano'
const getUserName = (from) => from.name || from
const getAction = (message = '') => _.get(message.split(' '), '[1]', '').trim()
const getEnvironment = (message = '') => _.get(message.split(' '), '[2]', '').trim()

const getDBEnvValues = async () => {
    const envsList = await Envs.scan().exec()
    return envsList
}

async function hipchatThread(message, from, html) {
    const action = getAction(message)
    console.log('action:',action)
    let respMessage = ''

    if (action === 'add') {
        const envsList = _.mapValues(_.groupBy(await getDBEnvValues(), 'env'), (item) => item[0])
        const environmentName = getEnvironment(message).toUpperCase()
        const environmentObj = new Envs({env: environmentName, project: 'MFO', user: null});

        if (envsList[environmentName]) {
            respMessage = 'Cabrón!'
            return;
        }

        await environmentObj.save()

        respMessage = 'Añadido!'
    }

    else if (action === 'remove' && isAdmin(getUserName(from))) {
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
            respMessage = `Gracias por avisar! ${environment} ahora está disponible!`
        }
    }

    else if (action === 'use') {
        const userName = getUserName(from)
        console.log('userName:',userName)
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
            respMessage = `${environment} está disponible! úsalo, pero avísame cuando ya no lo necesites`
        }
    }

    else {
        const envsList = _.sortBy(await getDBEnvValues(), 'env')
        let maxEnvStrLength = _.max(envsList.map((item) => item.env.length)) + 2

        if (html) {
            const envsListStr = envsList.map(envData => `&nbsp;&nbsp;&nbsp<b>${_.padEnd(envData.env, maxEnvStrLength, '.')}</b> ${envData.user ? envData.user : '<i>Disponible</i>'}<br/>`).join('')

            respMessage = `Lista actual de entornos:
        <br/>
        <pre>${envsListStr}
/env            // Muestra esta información
/env add ENV    // Agrega un entorno
/env remove ENV // Elimina un entorno
/env use ENV    // Para usar un entorno
/env free ENV   // Para liberar un entorno</pre>`
        } else {
            const envsListStr = envsList.map(envData => `*${envData.env}* => ${envData.user ? envData.user : 'Disponible'}`).join('\n')
            respMessage = `Lista actual de entornos:

${envsListStr}
            `
        }
    }
    return respMessage
}

async function sendResponseHipchat(response) {
    const url = process.env.HIPCHAT_ROOM_URL
    await request.post(url, {
        form: {
            color: "green",
            message: response
        }
    })
}

async function sendResponseSlack(response, url) {
    const payload = {
        text: response,
        /*"attachments": [
            {
                "text":"Partly cloudy today and tomorrow"
            }
        ]*/
    }
    await request.post({
        url,
        json: true,
        body: payload
    })
}

app.post('/user-message', async (req, res) => {
    console.log('BODY:', req.body)
    if (req.body.item) {
        const {message, from} = req.body.item.message
        const response = await hipchatThread(message, from, true)
        await sendResponseHipchat(response)
    }

    else if (req.body.response_url) {
        const {command, text, user_name} = req.body
        console.log(text, user_name)
        const response = await hipchatThread(command + ' ' + text, user_name)
        console.log('response:*',response)
        const url = req.body.response_url
        await sendResponseSlack(response, url)
    }
});

module.exports = app;
