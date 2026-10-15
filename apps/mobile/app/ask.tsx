import { maskText, useAsk, usePinMutations } from '@finally/api-client';
import type { AskResponse } from '@finally/contracts';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { mobileHref } from '@/components/kit';
import { Button, Card, Text } from '@/components/ui/primitives';
import { usePalette } from '@/lib/theme';

interface Turn {
  text: string;
  response: AskResponse | null;
  pending: boolean;
}

const SUGGESTIONS = ['How much did I spend on eating out last month?', "What's safe to spend today?", 'Where does my money go?', 'Who owes me money?'];

/** Ask: a chat that answers spending questions on your own server, with follow-ups such as "and September?". */
export default function Ask(): ReactNode {
  const p = usePalette();
  const ask = useAsk();
  const { pin } = usePinMutations();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');

  const send = (raw: string): void => {
    const t = raw.trim();
    if (!t) return;
    const previous = [...turns].reverse().find((x) => x.response?.query)?.response?.query ?? null;
    const idx = turns.length;
    setTurns((x) => [...x, { text: t, response: null, pending: true }]);
    setText('');
    ask.mutate({ text: t, previous }, { onSuccess: (response) => setTurns((x) => x.map((y, i) => (i === idx ? { ...y, response, pending: false } : y))), onError: () => setTurns((x) => x.map((y, i) => (i === idx ? { ...y, pending: false } : y))) });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1 bg-paper">
      <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text variant="title">Ask Finally</Text>
        {turns.length === 0 ? (
          <View className="gap-2">
            <Text variant="muted">Spending questions are answered on your own server. Try:</Text>
            {SUGGESTIONS.map((s) => <Button key={s} variant="outline" onPress={() => send(s)}>{s}</Button>)}
          </View>
        ) : turns.map((t, i) => (
          <View key={i} className="gap-2">
            <View className="self-end rounded-card bg-ink px-3.5 py-2"><Text className="text-paper">{t.text}</Text></View>
            {t.pending ? <Text variant="small">Thinking…</Text> : t.response?.answer && t.response.query ? (
              <Card>
                <Text variant="eyebrow">{t.response.answer.short}</Text>
                <Text variant="big" className="mt-1">{maskText(t.response.answer.big)}</Text>
                <Text variant="muted" className="mt-1">{maskText(t.response.answer.text)}</Text>
                {t.response.answer.rows?.map((r, j) => (
                  <View key={j} className="flex-row justify-between gap-3 border-t border-rule py-1.5"><Text variant="small" className="flex-1">{r.label}</Text><Text variant="num">{maskText(r.value)}</Text></View>
                ))}
                <View className="mt-3 flex-row flex-wrap gap-2">
                  {t.response.answer.action ? <Button size="sm" variant="outline" onPress={() => { router.back(); router.push(mobileHref(t.response!.answer!.action!.to)); }}>{t.response.answer.action.label}</Button> : null}
                  <Button size="sm" variant="ghost" onPress={() => pin.mutate(t.response!.query!.text)}>Pin to Today</Button>
                </View>
                <Text variant="small" className="mt-2">{t.response.answer.tier === 'public' ? `Only ${t.response.answer.sent} was sent` : 'Answered on this server · nothing sent'}</Text>
              </Card>
            ) : (
              <Card><Text variant="semi">I didn't catch that one.</Text><Text variant="small">{(t.response?.suggestions ?? []).join(' · ')}</Text></Card>
            )}
          </View>
        ))}
      </ScrollView>
      <View className="flex-row items-center gap-2 border-t border-rule bg-surface px-4 py-3">
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => send(text)}
          placeholder={turns.length ? 'Ask a follow-up: and September?' : 'Ask about your money'}
          placeholderTextColor={p.ink3}
          returnKeyType="send"
          accessibilityLabel="Your question"
          className="h-11 flex-1 rounded-control border border-rule bg-raised px-3 font-body text-[14px] text-ink"
        />
        <Button onPress={() => send(text)} loading={ask.isPending}>Ask</Button>
      </View>
    </KeyboardAvoidingView>
  );
}
