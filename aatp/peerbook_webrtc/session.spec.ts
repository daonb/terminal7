import { test, expect, Page, BrowserContext } from '@playwright/test'
import waitPort from 'wait-port'
import * as redis from 'redis'


    const local = process.env.LOCALDEV !== undefined,
          url = local?"http://localhost:3000":"http://terminal7"

test.describe('terminal7 session', ()  => {

    const sleep = (ms) => { return new Promise(r => setTimeout(r, ms)) }
    const connectGate = async () => {
        const btns = page.locator('#gates button')
        await page.screenshot({ path: `/result/zero.png` })
        await expect(btns).toHaveCount(2)
        await btns.first().dispatchEvent('pointerdown')
        await sleep(50)
        await btns.first().dispatchEvent('pointerup')
    }

    let page: Page,
        context: BrowserContext

    test.afterAll(async () => await context.close() )
    test.beforeAll(async ({ browser }) => {
        context = await browser.newContext()
        page = await context.newPage()
        page.on('console', (msg) => console.log('console log:', msg.text()))
        page.on('pageerror', (err: Error) => console.log('PAGEERROR', err.message))
        await waitPort({host:'peerbook', port:17777})
        await waitPort({host:'terminal7', port:80})
        const response = await page.goto(url)
        await expect(response.ok(), `got error ${response.status()}`).toBeTruthy()
        await page.evaluate(async () => {
            window.terminal7.notify = (msg: string) => console.log("NOTIFY: "+msg)
            localStorage.setItem("CapacitorStorage.dotfile",`
[theme]
foreground = "#00FAFA"
background = "#000"
selection = "#D9F505"
[indicators]
flash = 100
[exec]
shell = "bash"
[net]
timeout = 3000
retries = 3
ice_server = "stun:stun2.l.google.com:19302"
peerbook = "peerbook:17777"
[ui]
quickest_press = 1000
max_tabs = 10
cut_min_distance = 80
cut_min_speed = 2.5
pinch_max_y_velocity = 0.1
[peerbook]
email = "joe@example.com"
insecure = true`)
        })
        // first page session for just for storing the dotfiles
        await page.reload({waitUntil: "networkidle"})
        await page.evaluate(async () => {
            window.terminal7.notify = (msg: string) => console.log("NOTIFY: "+msg)
        })
        // add terminal7 initializtion and globblas
        await waitPort({host:'webexec', port:7777})

        const redisClient = redis.createClient({url: 'redis://redis'})
        redisClient.on('error', err => console.log('Redis client error', err))
        await redisClient.connect()
        let keys = []
        while (keys.length < 2) {
            keys = await redisClient.keys('peer*')
            sleep(200)
        }

        keys.forEach(async key => {
            console.log("verifying: " +key)
            await redisClient.hSet(key, 'verified', "1")
        })
        await page.reload({waitUntil: "networkidle"})
        await page.evaluate(async () => {
            window.terminal7.notify = (msg: string) => console.log("NOTIFY: "+msg)
        })
    })

    test('connect to gate see help page and hide it', async () => {
        await sleep(1000)
        connectGate()
        await page.screenshot({ path: `/result/second.png` })
        // await expect(page.locator('.pane')).toHaveCount(1)
        const help  = page.locator('#help-gate')
        await expect(help).toBeVisible()
        await help.click()
        await expect(help).toBeHidden()
    })
    test('pane is visible and session is open', async () => {
        await expect(page.locator('.pane')).toHaveCount(1)
        await sleep(500)
        const paneState = await page.evaluate(() => {
            const pane = window.terminal7.activeG.activeW.activeP
            return pane.d.readyState
        })
        expect(paneState).toEqual("open")
    })
    test('a pane can be split', async () => {
        await page.evaluate(async() => {
            const pane = window.terminal7.activeG.activeW.activeP
            pane.split("topbottom")
        })
        await expect(page.locator('.pane')).toHaveCount(2)
        await page.evaluate(() => window.terminal7.goHome())
    })
    test('a gate restores after reload', async() => {
        await page.reload({waitUntil: "networkidle"})
        await sleep(500)
        await page.evaluate(async () => {
            window.terminal7.notify = console.log
            window.terminal7.conf.net.peerbook = "peerbook:17777"
            window.terminal7.conf.peerbook = { email: "joe@example.com", insecure: true }
            await window.terminal7.pbConnect()
        })
        await sleep(500)
        connectGate()
        await sleep(500)
        await page.screenshot({ path: `/result/second.png` })
        await expect(page.locator('.pane')).toHaveCount(2)
        await expect(page.locator('.windows-container')).toBeVisible()
    })
    test('a pane can be close', async() => {
        const exitState = await page.evaluate(() => {
            try {
                window.terminal7.activeG.activeW.activeP.d.send("exit\n")
                return "success"
            } catch(e) { return e.toString() }
        })
        expect(exitState).toEqual("success")
        await expect(page.locator('.pane')).toHaveCount(1)
    })
    test('disengage and reconnect', async() => {
        await page.evaluate(async() => {
            const gate = window.terminal7.activeG
            gate.activeW.activeP.d.send("seq 10; sleep 1; seq 10 20\n")
        })
        await sleep(100)
        await page.screenshot({ path: `/result/second.png` })
        const lines1 = await page.evaluate(async() => {
            const gate = window.terminal7.activeG
            await gate.disengage().then(() => {
                window.terminal7.clearTimeouts()
                window.terminal7.activeG.session = null
            })
            return gate.activeW.activeP.t.buffer.active.length
        })
        await sleep(1000)
        await page.screenshot({ path: `/result/third.png` })
        await page.evaluate(async() => {
            window.terminal7.activeG.connect()
        })
        // connectGate()
        await expect(page.locator('.pane')).toHaveCount(1)
        await sleep(500)
        const lines2 = await page.evaluate(() =>
           window.terminal7.activeG.activeW.activeP.t.buffer.active.length)
        await page.screenshot({ path: `/result/fourth.png` })
        console.log(lines1, lines2)
        expect(lines2-lines1).toEqual(11)
    })
    test('after disengage & reconnect, a a pane can be close', async() => {
        await page.screenshot({ path: `/result/fifth.png` })
        const exitState = await page.evaluate(() => {
            const pane = window.terminal7.activeG.activeW.activeP
            try {
                pane.d.send("exit\n")
                return "success"
            } catch(e) { return e.toString() }
        })
        expect(exitState).toEqual("success")
        await expect(page.locator('.pane')).toHaveCount(0)
    })
    test.skip('auto restore gate', async() => {
        connectGate()
        await expect(page.locator('.pane')).toHaveCount(1)
        await page.screenshot({ path: `/result/6.png` })
        // set auto restore to true
        await page.evaluate(async () => {
            const value = localStorage.getItem("CapacitorStorage.dotfile")
            const lines = value.split("\n").map((l: string) => {
                if (l == "[peerbook]")
                    return "auto_restore = true\n" + l
                else 
                    return l
            })
            await localStorage.setItem("CapacitorStorage.dotfile", lines.join("\n"))
        })
        await page.reload({waitUntil: "networkidle"})

        await page.evaluate(async () => {
            window.terminal7.notify = console.log
            window.terminal7.conf.net.peerbook = "peerbook:17777"
            window.terminal7.conf.peerbook = { email: "joe@example.com", insecure: true }
            await window.terminal7.pbConnect()
        })
        await sleep(1000)
        await page.screenshot({ path: `/result/7.png` })
        const inGate = await page.evaluate(() => window.terminal7.activeG != null)
        expect(inGate).toBeTruthy()
        await expect(page.locator('.pane')).toHaveCount(1)
    })
})
