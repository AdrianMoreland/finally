import { eur, eur0, shortDate, useGoalMutations, useGoals } from '@finally/api-client';
import { useState, type ReactNode } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { ErrorCard, LoadingCard } from '@/components/screen';
import { StackScreen } from '@/components/stack-screen';
import { Button, Card, Text, Track } from '@/components/ui/primitives';

const input = 'rounded-control border border-rule bg-surface px-3 py-2.5 font-body text-[14px] text-ink';

export default function Goals(): ReactNode {
  const goals = useGoals();
  const { create, remove } = useGoalMutations();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');

  const save = (): void => {
    if (!name.trim() || !/^\d+(\.\d{1,2})?$/.test(target) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('Check the form', 'Give it a name, a target like 5000 and a date like 2027-06-30.');
      return;
    }
    create.mutate(
      { name: name.trim(), target, targetDate: date },
      {
        onSuccess: () => {
          setAdding(false);
          setName('');
          setTarget('');
          setDate('');
        },
        onError: (e) => Alert.alert('Could not add the goal', e instanceof Error ? e.message : ''),
      },
    );
  };

  return (
    <StackScreen eyebrow="Linked to Revolut vaults" title="Goals" right={<Button size="sm" variant="outline" onPress={() => setAdding(!adding)}>{adding ? 'Cancel' : 'New'}</Button>}>
      {adding ? (
        <Card className="gap-2.5">
          <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor="#8A9790" className={input} accessibilityLabel="Goal name" />
          <TextInput value={target} onChangeText={setTarget} placeholder="Target (€)" placeholderTextColor="#8A9790" keyboardType="decimal-pad" className={input} accessibilityLabel="Target amount" />
          <TextInput value={date} onChangeText={setDate} placeholder="Target date (YYYY-MM-DD)" placeholderTextColor="#8A9790" autoCapitalize="none" className={input} accessibilityLabel="Target date" />
          <Button loading={create.isPending} onPress={save}>
            Add goal
          </Button>
        </Card>
      ) : null}
      {goals.error ? <ErrorCard error={goals.error} retry={() => void goals.refetch()} /> : null}
      {goals.isLoading ? <LoadingCard height={160} /> : null}
      {goals.data?.map((g) => (
        <Card key={g.id} className="gap-2.5">
          <View className="flex-row items-start justify-between">
            <Text variant="heading">{g.name}</Text>
            <Text variant="small" className="text-ink-3" onPress={() => Alert.alert(`Delete ${g.name}?`, undefined, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(g.id) }])}>
              Delete
            </Text>
          </View>
          <Text variant="big" className="text-[30px]">
            {eur(g.saved)} <Text variant="muted">of {eur0(g.target)}</Text>
          </Text>
          <Track value={g.progress} height={10} />
          <View className="flex-row justify-between">
            <Text variant="small">By {shortDate(g.targetDate)} {g.targetDate.slice(0, 4)}</Text>
            <Text variant="small" className="text-ink">
              {eur0(g.monthlyNeeded)} a month
            </Text>
          </View>
        </Card>
      ))}
    </StackScreen>
  );
}
