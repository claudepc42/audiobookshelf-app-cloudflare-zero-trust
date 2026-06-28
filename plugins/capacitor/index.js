import Vue from 'vue'
import { AbsAudioPlayer } from './AbsAudioPlayer'
import { AbsCfZeroTrust } from './AbsCfZeroTrust'
import { AbsDownloader } from './AbsDownloader'
import { AbsFileSystem } from './AbsFileSystem'
import { AbsDatabase } from './AbsDatabase'
import { AbsLogger } from './AbsLogger'
import { Capacitor } from '@capacitor/core'

Vue.prototype.$platform = Capacitor.getPlatform()

export { AbsAudioPlayer, AbsCfZeroTrust, AbsDownloader, AbsFileSystem, AbsLogger, AbsDatabase }
