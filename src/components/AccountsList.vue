<template>

  <div class="w-full">
    <table class="w-full">
      <thead>
        <tr>
          <AccountTableHeader :sortedBy="state.sortBy" :ascending="state.sortAsc" @sort="updateSort" name="login" sortable />
          <AccountTableHeader :sortedBy="state.sortBy" :ascending="state.sortAsc" @sort="updateSort" name="name" sortable />
          <AccountTableHeader :sortedBy="state.sortBy" :ascending="state.sortAsc" @sort="updateSort" name="tags" />
          <AccountTableHeader :sortedBy="state.sortBy" :ascending="state.sortAsc" @sort="updateSort" name="lvl" sortable small />
          <AccountTableHeader :sortedBy="state.sortBy" :ascending="state.sortAsc" @sort="updateSort" name="prime" sortable small>
            <PrimeIcon class="h-4 mb-0.5"/>
          </AccountTableHeader>
          <AccountTableHeader :sortedBy="state.sortBy" :ascending="state.sortAsc" @sort="updateSort" name="comp" sortable small />
          <AccountTableHeader :sortedBy="state.sortBy" :ascending="state.sortAsc" @sort="updateSort" name="wm" sortable small />
          <AccountTableHeader :sortedBy="state.sortBy" :ascending="state.sortAsc" @sort="updateSort" name="dz" sortable small />
          <AccountTableHeader :sortedBy="state.sortBy" :ascending="state.sortAsc" @sort="updateSort" name="ban/error" sortable />
          <AccountTableHeader :sortedBy="state.sortBy" :ascending="state.sortAsc" @sort="updateSort" name="action" small>&nbsp;</AccountTableHeader>
        </tr>
      </thead>
      <tbody>
        <AccountTableEntry v-for="(account, username) in state.accounts" :key="username" :username="username" :account="account" />
      </tbody>
    </table>
  </div>

</template>

<script setup>
import { reactive } from 'vue';
import AccountTableHeader from './AccountTableHeader.vue';
import AccountTableEntry from './AccountTableEntry.vue';
import PrimeIcon from './icons/PrimeIcon.vue';

const state = reactive({
  tags: null,
  accounts: null,
  sortBy: null,
  sortAsc: null,
})


async function updateAll() {

  const [tags, accounts] = await Promise.all([
    ipcRenderer.invoke('settings:get', 'tags'),
    await ipcRenderer.invoke('accounts:get'),
  ]);

  state.tags = tags;
  state.accounts = accounts;
}

async function updateSort({name, ascending}) {
  state.sortBy = name;
  state.sortAsc = ascending;
}

updateAll();

</script>