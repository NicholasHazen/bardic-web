<script lang="ts">
  import { serverRows } from '../../../fixtures/voices';
  import BreezeView from '../BreezeView.svelte';
  import ScreenFrame from './ScreenFrame.svelte';
</script>

<ScreenFrame>
  <BreezeView
    address="http://breeze.local:8080"
    callout={{ tone: 'good', title: 'Connected', body: '14 voices found. Bardic asks your server for its voices when you open this screen and once a day.' }}
    rows={serverRows}
    total={14}
  />
</ScreenFrame>
