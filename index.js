import './state/store/firebase-emulator-bootstrap';
import TrackPlayer from 'react-native-track-player';
import { playbackService } from './features/bible-audio/engine';

TrackPlayer.registerPlaybackService(() => playbackService);
require('expo-router/entry');
